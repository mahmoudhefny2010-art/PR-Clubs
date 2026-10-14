// Explicit local Mongo -> SQL transfer. Never writes to the original Mongo DB.
require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const { MongoClient, BSON } = require('mongoose').mongo;
const { catalog } = require('../database/catalog');
const migration = require('./sqlserver-migrate.cjs');
const runtime = require('../database/runtime');
const { schemaSql } = require('./sqlserver-schema.cjs');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');

function encryptBackup(snapshot, key) {
  const compressed = zlib.gzipSync(Buffer.from(BSON.EJSON.stringify(snapshot)));
  const iv = crypto.randomBytes(12), cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(compressed), cipher.final()]);
  return { format: 'miu-migration-backup-v1', algorithm: 'aes-256-gcm+gzip', iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: encrypted.toString('base64') };
}
function decryptBackup(envelope, key) {
  if (envelope.format !== 'miu-migration-backup-v1' || envelope.algorithm !== 'aes-256-gcm+gzip') throw new Error('Unsupported backup envelope.');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(envelope.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
  const compressed = Buffer.concat([decipher.update(Buffer.from(envelope.data, 'base64')), decipher.final()]);
  return BSON.EJSON.parse(zlib.gunzipSync(compressed).toString());
}
function isolatedRestoreUri(uri, database, authSource) {
  if (!/^clubs_restore_[a-z0-9_]+$/.test(database)) throw new Error('Unexpected isolated restore name.');
  const parsed = new (require('mongodb-connection-string-url').ConnectionString)(uri);
  if (!['mongodb:', 'mongodb+srv:'].includes(parsed.protocol)) throw new Error('Expected a Mongo connection URI.');
  parsed.pathname = '/' + database;
  if (authSource) parsed.searchParams.set('authSource', authSource);
  return parsed.toString();
}
function restoreIndex(index) {
  // Keep TTL metadata in the backup, but freeze expiration in the isolated copy.
  if (index.name === '_id_' || index.expireAfterSeconds !== undefined) return null;
  const options = {};
  for (const key of ['name', 'unique', 'sparse', 'partialFilterExpression', 'collation', 'hidden', 'wildcardProjection']) {
    if (index[key] !== undefined) options[key] = index[key];
  }
  return { key: index.key, ...options };
}
async function snapshotDatabase(client, database) {
  const db = client.db(database), specs = catalog();
  const known = new Set(specs.map(spec => spec.model.collection.collectionName));
  const metadata = (await db.listCollections({}, { nameOnly: false }).toArray()).filter(item => !item.name.startsWith('system.'));
  if (metadata.some(item => item.type !== 'collection' || !known.has(item.name))) throw new Error('Unmapped source collection/view.');
  const collections = [];
  for (const item of metadata) collections.push({ name: item.name, options: item.options, indexes: await db.collection(item.name).listIndexes().toArray() });
  const session = client.startSession({ snapshot: true });
  try {
    for (const item of collections) item.documents = await db.collection(item.name).find({}, { session }).sort({ _id: 1 }).toArray();
    // Metadata is outside the snapshot session; reject concurrent schema changes.
    for (const item of collections) {
      const indexes = await db.collection(item.name).listIndexes().toArray();
      if (migration.canonical(indexes) !== migration.canonical(item.indexes)) throw new Error('Source indexes changed during backup.');
    }
    return { format: 'miu-consistent-migration-snapshot-v1', sourceDatabase: database, createdAt: new Date(), snapshotTime: session.snapshotTime || null, collections };
  } finally { await session.endSession(); }
}
function snapshotDigests(snapshot) {
  return Object.fromEntries(snapshot.collections.map(item => [item.name, {
    count: item.documents.length,
    hash: hash(migration.canonical(item.documents))
  }]));
}
async function writePrivate(file, value) {
  await fs.promises.writeFile(file, typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value, null, 2), { flag: 'wx', mode: 0o600 });
}
async function restoreAndVerify(client, snapshot, name) {
  if (name === snapshot.sourceDatabase || !name.startsWith('clubs_restore_')) throw new Error('Restore must use a new isolated database.');
  const db = client.db(name);
  if ((await db.listCollections({}, { nameOnly: true }).toArray()).length) throw new Error('Isolated restore is not empty.');
  for (const item of snapshot.collections) {
    const collection = await db.createCollection(item.name, item.options);
    for (let offset = 0; offset < item.documents.length; offset += 100) await collection.insertMany(item.documents.slice(offset, offset + 100), { ordered: true });
    const indexes = item.indexes.map(restoreIndex).filter(Boolean);
    if (indexes.length) await collection.createIndexes(indexes);
  }
  await verifyIsolatedRestore(client, snapshot, name);
}
async function verifyIsolatedRestore(client, snapshot, name) {
  if (name === snapshot.sourceDatabase || !/^clubs_restore_[a-z0-9_]+$/.test(name)) throw new Error('Unexpected isolated restore identity.');
  const db = client.db(name);
  const remaining = [...snapshot.collections];
  const verify = async () => { while (remaining.length) {
    const item = remaining.shift();
    const collection = db.collection(item.name);
    const indexes = item.indexes.map(restoreIndex).filter(Boolean);
    const restored = await collection.find({}).sort({ _id: 1 }).toArray();
    if (hash(migration.canonical(restored)) !== hash(migration.canonical(item.documents))) throw new Error('Isolated restore content mismatch.');
    const actualIndexes = (await collection.listIndexes().toArray()).map(restoreIndex).filter(Boolean);
    if (migration.canonical(actualIndexes) !== migration.canonical(indexes)) throw new Error('Isolated restore index mismatch.');
  } };
  await Promise.all([verify(), verify(), verify()]);
}
async function assertSourceUnchanged(client, snapshot) {
  if (!snapshot.snapshotTime) {
    if (migration.canonical(snapshotDigests(await snapshotDatabase(client, snapshot.sourceDatabase))) !== migration.canonical(snapshotDigests(snapshot))) throw new Error('Mongo changed since the verified snapshot.');
    return;
  }
  const stream = client.db(snapshot.sourceDatabase).watch([{ $match: {
    clusterTime: { $gt: snapshot.snapshotTime },
    $or: [{ 'ns.coll': { $in: snapshot.collections.map(item => item.name) } }, { operationType: { $in: ['dropDatabase', 'invalidate'] } }]
  } }], { startAtOperationTime: snapshot.snapshotTime, maxAwaitTimeMS: 1000 });
  try { if (await stream.tryNext()) throw new Error('Mongo changed since the verified snapshot; delta reconciliation is required before activation.'); }
  finally { await stream.close(); }
}
async function main(directory, { resume = false } = {}) {
  if (process.env.DATABASE_PROVIDER !== 'sqlserver' || process.env.SQLSERVER_DATABASE !== 'clubs') throw new Error('This approved transfer targets SQL Server database clubs only.');
  if (process.env.NODE_ENV === 'production') throw new Error('Run the transfer outside the production web process.');
  const config = require('../database/config').sqlConfig();
  if (![os.hostname().toLowerCase(), 'localhost', '127.0.0.1', '.'].includes(config.server.toLowerCase()) || config.port !== 14330) throw new Error('The approved local SQL target changed.');
  const artifact = name => migration.protectedPath(path.join(directory, name));
  const client = new MongoClient(process.env.MONGO_URI, { serverSelectionTimeoutMS: 12000, readPreference: 'primary', maxPoolSize: 3 });
  let phase = 'inspect';
  const status = { startedAt: new Date().toISOString(), targetDatabase: 'clubs', originalMongoWritten: false };
  try {
    await client.connect();
    const source = client.db();
    if (source.databaseName !== 'clubs_dashboard') throw new Error('The approved Mongo source changed.');
    await runtime.connect({ readiness: false });
    const tables = await runtime.request().query('SELECT COUNT(*) AS [total] FROM sys.tables WHERE is_ms_shipped = 0;');
    const targetEmpty = tables.recordset[0].total === 0;
    if (!targetEmpty && !resume) throw new Error('SQL target is no longer empty; refusing an unreviewed overwrite.');
    let snapshot, evidence;
    if (resume) {
      phase = 'verify-existing-backup';
      console.log('Verifying the existing encrypted backup and isolated restore before resuming.');
      const envelope = JSON.parse(await fs.promises.readFile(artifact('backup.aes256gcm.json'), 'utf8'));
      snapshot = decryptBackup(envelope, await fs.promises.readFile(artifact('backup.key')));
      status.backupHash = hash(await fs.promises.readFile(artifact('backup.aes256gcm.json')));
      evidence = JSON.parse(await fs.promises.readFile(artifact('backup-evidence.json'), 'utf8'));
      migration.backupEvidence(evidence);
      if (evidence.backupId !== status.backupHash || evidence.sourceDatabase !== source.databaseName || snapshot.sourceDatabase !== source.databaseName) throw new Error('Existing backup evidence does not match the approved source.');
      status.counts = Object.fromEntries(snapshot.collections.map(item => [item.name, item.documents.length]));
      await verifyIsolatedRestore(client, snapshot, evidence.restoredDatabase);
    } else {
    phase = 'backup';
    console.log('Reading a consistent source snapshot (original Mongo remains read-only).');
    snapshot = await snapshotDatabase(client, source.databaseName);
    status.counts = Object.fromEntries(snapshot.collections.map(item => [item.name, item.documents.length]));
    const key = crypto.randomBytes(32);
    const envelope = encryptBackup(snapshot, key);
    await writePrivate(artifact('backup.key'), key);
    await writePrivate(artifact('backup.aes256gcm.json'), envelope);
    const recovered = decryptBackup(JSON.parse(await fs.promises.readFile(artifact('backup.aes256gcm.json'), 'utf8')), await fs.promises.readFile(artifact('backup.key')));
    if (hash(migration.canonical(recovered)) !== hash(migration.canonical(snapshot))) throw new Error('Backup decryption/content verification failed.');
    status.backupHash = hash(await fs.promises.readFile(artifact('backup.aes256gcm.json')));
    phase = 'isolated-restore';
    const restoreName = 'clubs_restore_' + new Date().toISOString().slice(0, 10).replaceAll('-', '') + '_' + crypto.randomBytes(6).toString('hex');
    console.log('Restoring and verifying the encrypted backup in a new isolated Mongo database.');
    await restoreAndVerify(client, recovered, restoreName);
    evidence = { backupId: status.backupHash, sourceDatabase: source.databaseName, restoredDatabase: restoreName, isolatedRestoreVerifiedAt: new Date().toISOString(), counts: status.counts,
      frozenTtlIndexes: snapshot.collections.flatMap(item => item.indexes.filter(index => index.expireAfterSeconds !== undefined).map(index => ({ collection: item.name, name: index.name }))) };
    await writePrivate(artifact('backup-evidence.json'), evidence);
    }
    status.restoredDatabase = evidence.restoredDatabase;
    process.env.MIGRATION_SOURCE_URI = isolatedRestoreUri(process.env.MONGO_URI, evidence.restoredDatabase, client.options.credentials?.source);
    process.env.MIGRATION_SOURCE_IS_ISOLATED_RESTORE = 'true';
    process.env.SQLSERVER_MIGRATION_TARGET_DATABASE = 'clubs';
    phase = 'preflight';
    const exportFile = artifact('source.ndjson');
    if (!fs.existsSync(exportFile)) await migration.exportSource(exportFile, artifact('backup-evidence.json'));
    const audit = await migration.preflight(exportFile);
    if (!targetEmpty) {
      const state = (await runtime.request().query('SELECT [version], [validatedAt] FROM [dbo].[PlatformDatabaseState] WHERE [id]=1;')).recordset[0];
      const runs = (await runtime.request().query('SELECT [sourceHash], [status] FROM [dbo].[PlatformMigrationRun];')).recordset;
      if (state?.version !== 1 || state.validatedAt || runs.length !== 1 || runs[0].sourceHash !== audit.sourceHash || runs[0].status !== 'importing') throw new Error('Existing SQL records do not belong to this unvalidated migration.');
    }
    for (const spec of audit.specs) {
      const documents = snapshot.collections.find(item => item.name === spec.model.collection.collectionName)?.documents || [];
      if (audit.counts[spec.name] !== documents.length || documents.some(document => audit.digests[spec.name].get(String(document._id)) !== hash(migration.canonical(document)))) throw new Error('Export differs from the verified backup.');
    }
    status.preflight = { rejected: audit.rejected, counts: audit.counts, sourceHash: audit.sourceHash, indexMappings: audit.indexMappings };
    await writePrivate(artifact(resume ? 'preflight-resume-' + Date.now() + '.json' : 'preflight.json'), status.preflight);
    if (audit.rejected.length) {
      console.log('Preflight rejected:', JSON.stringify(audit.rejected));
      throw new Error('Source mapping needs review; SQL target remains empty.');
    }
    await assertSourceUnchanged(client, snapshot);
    phase = 'schema';
    console.log(targetEmpty ? 'Source preflight passed; creating the approved empty SQL target schema.' : 'Source preflight passed; resuming this migration without rewriting verified records.');
    if (targetEmpty) await runtime.request().batch(schemaSql());
    phase = 'import';
    const result = await migration.importSource(exportFile, audit);
    if (!result.validation.passed) throw new Error('SQL reconciliation failed.');
    phase = 'source-final-check';
    await assertSourceUnchanged(client, snapshot);
    status.result = result;
    status.completedAt = new Date().toISOString();
    status.passed = true;
    const report = JSON.stringify(status, null, 2);
    await writePrivate(artifact('migration-report.json'), report);
    phase = 'promote';
    await runtime.transaction(null, async session => {
      await runtime.request(session).input('sourceHash', audit.sourceHash).input('reportHash', hash(report)).query('UPDATE [dbo].[PlatformDatabaseState] SET [validatedAt]=SYSUTCDATETIME(), [sourceHash]=@sourceHash, [validationReportHash]=@reportHash WHERE [id]=1;');
      await runtime.request(session).input('runId', result.runId).query("UPDATE [dbo].[PlatformMigrationRun] SET [status]=N'validated', [completedAt]=SYSUTCDATETIME() WHERE [runId]=@runId;");
    });
    await runtime.connect();
    console.log('SQL import, per-record hashes, references and runtime readiness: passed.');
    console.log('Transferred records:', Object.values(audit.counts).reduce((sum, count) => sum + count, 0));
    console.log('Private backup and reports:', directory);
  } catch (error) {
    await writePrivate(artifact('failure-' + crypto.randomBytes(4).toString('hex') + '.json'), { ...status, phase, passed: false, error: { code: error.code || error.name, number: error.number || null } }).catch(() => {});
    console.error('Transfer stopped in phase:', phase, 'code:', error.code || error.name, 'number:', error.number || 'none');
    // Only our own fixed messages are shown; never copy a raw driver message.
    if (error.constructor === Error && !error.code) console.error(error.message);
    throw error;
  } finally { await client.close().catch(() => {}); await runtime.disconnect().catch(() => {}); }
}
if (require.main === module) {
  if (!['--execute', '--resume'].includes(process.argv[2]) || !process.argv[3]) throw new Error('Use --execute or --resume with the approved private artifact directory.');
  main(process.argv[3], { resume: process.argv[2] === '--resume' }).catch(() => { process.exitCode = 1; });
}
module.exports = { encryptBackup, decryptBackup, isolatedRestoreUri, restoreIndex, snapshotDigests };
