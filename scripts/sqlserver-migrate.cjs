// Explicit CLI only. Does not import server.js or write to MongoDB.
require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const readline = require('node:readline');
const mongoose = require('mongoose');
const { catalog } = require('../database/catalog');
const { stored, write } = require('../database/models');
const { matches } = require('../database/values');
const runtime = require('../database/runtime');
const EJSON = mongoose.mongo.BSON.EJSON;
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
function canonical(value) {
  const plain = EJSON.serialize(value, { relaxed: false });
  const sorted = x => Array.isArray(x) ? x.map(sorted) : x && typeof x === 'object' ? Object.fromEntries(Object.keys(x).sort().map(k => [k, sorted(x[k])])) : x;
  return JSON.stringify(sorted(plain));
}
function protectedPath(file) {
  if (!file || !path.isAbsolute(file)) throw new Error('Migration artifacts require explicit absolute paths outside the project.');
  const root = path.resolve(__dirname, '..');
  const result = path.resolve(file);
  const relative = path.relative(root, result);
  if (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative)) throw new Error('Migration artifacts contain private data and must be outside the project.');
  // Resolve existing parents to reject symlinks back into the application tree.
  const parent = fs.realpathSync(path.dirname(result));
  const actual = fs.existsSync(result) ? fs.realpathSync(result) : path.resolve(parent, path.basename(result));
  const actualRelative = path.relative(fs.realpathSync(root), actual);
  if (!actualRelative.startsWith('..' + path.sep) && actualRelative !== '..' && !path.isAbsolute(actualRelative)) throw new Error('Artifact parent resolves inside the project.');
  return actual;
}
function targetGate(env = process.env) {
  if (env.NODE_ENV === 'production') throw new Error('Run migration tools in an isolated migration environment, never the production web process.');
  const prefix = require('../database/config').sqlPrefix(env);
  if (!env[`${prefix}_MIGRATION_TARGET_DATABASE`] || env[`${prefix}_MIGRATION_TARGET_DATABASE`] !== env[`${prefix}_DATABASE`]) throw new Error(`${prefix}_MIGRATION_TARGET_DATABASE must explicitly match the isolated target database.`);
}
function backupEvidence(value) {
  if (!value || !value.backupId || !value.isolatedRestoreVerifiedAt || !Number.isFinite(Date.parse(value.isolatedRestoreVerifiedAt)) || !value.sourceDatabase || !value.restoredDatabase || value.sourceDatabase === value.restoredDatabase) throw new Error('Verified backup evidence with distinct source/restored database identities is required.');
}
async function* entries(file) {
  const stream = fs.createReadStream(file, { encoding: 'utf8' });
  const lines = readline.createInterface({ input: stream, crlfDelay: Infinity });
  try { for await (const line of lines) if (line.trim()) yield EJSON.parse(line); }
  finally { lines.close(); stream.destroy(); }
}
async function fileHash(file) {
  const digest = crypto.createHash('sha256'); for await (const chunk of fs.createReadStream(file)) digest.update(chunk); return digest.digest('hex');
}
async function preflight(file) {
  const specs = catalog(), byName = new Map(specs.map(s => [s.name, s]));
  const ids = new Map(specs.map(s => [s.name, new Set()]));
  const unique = new Map(); const refs = []; const rejected = [];
  const counts = Object.fromEntries(specs.map(s => [s.name, 0]));
  const digests = Object.fromEntries(specs.map(s => [s.name, new Map()]));
  let header, footer, ordinal = 0;
  const indexMappings = [];
  for await (const entry of entries(file)) {
    if (!header) {
      if (entry.format !== 'miu-sqlserver-export-v1') throw new Error('Missing/unsupported source manifest.');
      backupEvidence(entry.backup);
      if (!Array.isArray(entry.models) || entry.models.length !== specs.length || specs.some(s => !entry.models.includes(s.name))) throw new Error('Export must account for all 30 declared models.');
      if (!Array.isArray(entry.collectionMetadata)) throw new Error('Source index/collection metadata is required.');
      for (const metadata of entry.collectionMetadata) {
        const spec = specs.find(s => s.model.collection.collectionName === metadata.name);
        if (!spec) throw new Error('Unknown source collection metadata.');
        if (metadata.options?.validator) throw new Error('A live collection validator needs an explicit reviewed SQL mapping.');
        for (const index of metadata.indexes || []) {
          if (Object.keys(index.key || {}).length === 1 && index.key._id === 1) continue;
          const mapped = spec.indexes.find(declared => canonical(declared.keys) === canonical(index.key)
            && Boolean(declared.options.unique) === Boolean(index.unique)
            && Boolean(declared.options.sparse) === Boolean(index.sparse)
            && canonical(declared.options.partialFilterExpression || null) === canonical(index.partialFilterExpression || null)
            && (declared.options.expireAfterSeconds ?? null) === (index.expireAfterSeconds ?? null));
          if (!mapped) throw new Error('An extra/different live index needs an explicit SQL mapping: ' + spec.name);
          if (mapped.reviewedLegacy) indexMappings.push({ model: spec.name, sourceIndex: index.name, targetIndex: mapped.name, keys: mapped.keys, unique: Boolean(mapped.options.unique) });
        }
      }
      header = entry; continue;
    }
    if (entry.end === true) { if (footer) throw new Error('Multiple export footers.'); footer = entry; continue; }
    if (footer) throw new Error('Data after export footer.');
    const spec = byName.get(entry.model); ordinal++;
    if (!spec || !entry.document || typeof entry.document !== 'object') { rejected.push({ ordinal, reason: 'Unknown model or invalid document.' }); continue; }
    const data = entry.document, id = String(data._id);
    counts[spec.name]++;
    try {
      if (data._id == null) throw new Error('Missing source _id.');
      if (ids.get(spec.name).has(id)) throw new Error('Duplicate source _id.');
      ids.get(spec.name).add(id);
      stored(spec, data); // Reject truncation, unsupported BSON, invalid numeric/date types.
      const document = spec.model.hydrate(data);
      await document.validate();
      for (const index of spec.indexes.filter(i => i.options.unique)) {
        const keys = Object.keys(index.keys);
        if (index.options.sparse && !keys.some(k => Object.hasOwn(data, k))) continue;
        if (index.options.partialFilterExpression && !matches(data, index.options.partialFilterExpression)) continue;
        const fingerprint = canonical(keys.map(k => data[k] ?? null));
        const name = spec.name + '.' + index.name;
        const seen = unique.get(name) || new Set();
        if (seen.has(fingerprint)) throw new Error('Duplicate declared unique index: ' + index.name);
        seen.add(fingerprint); unique.set(name, seen);
      }
      if (data.clubId != null && data.clubId !== 0 && spec.name !== 'Club') refs.push({ from: spec.name, ordinal, target: 'Club.numeric', id: String(data.clubId) });
      if (spec.name === 'Club') { const clubIds = ids.get('Club.numeric') || new Set(); if (clubIds.has(String(data.id))) throw new Error('Duplicate club ID.'); clubIds.add(String(data.id)); ids.set('Club.numeric', clubIds); }
      for (const column of spec.columns) {
        const reference = column.path.options.ref || (spec.name === 'AttendanceRecord' && column.name === 'sessionId' ? 'AttendanceSession' : spec.name === 'SpeakerRequest' && column.name === 'inviteId' ? 'SpeakerInvite' : null);
        if (reference && data[column.name] != null && !(spec.name === 'SupervisorReview' && column.name === 'supervisorId')) refs.push({ from: spec.name, ordinal, target: reference, id: String(data[column.name]) });
      }
      // JSON role scopes have no native FK; validate all declared nested club IDs.
      for (const clubId of [...(data.assignedClubIds || []), ...(data.roleAssignments || []).flatMap(role => [role.clubId, ...(role.assignedClubIds || [])])]) if (clubId != null && clubId !== 0) refs.push({ from: spec.name, ordinal, target: 'Club.numeric', id: String(clubId) });
      digests[spec.name].set(id, hash(canonical(data)));
    } catch (error) {
      // Never copy a validation message that might include a submitted value.
      rejected.push({ model: spec.name, ordinal, reason: error.name === 'ValidationError' ? 'Schema validation failed: ' + Object.keys(error.errors).join(', ') : error.message });
    }
  }
  if (!header || !footer || Object.entries(counts).some(([model, count]) => footer.counts?.[model] !== count)) throw new Error('Export is incomplete or collection counts do not match its footer.');
  for (const spec of specs) if (counts[spec.name] && !header.collectionMetadata.some(m => m.name === spec.model.collection.collectionName)) throw new Error('Missing live index metadata for a populated collection.');
  for (const ref of refs) if (!ids.get(ref.target)?.has(ref.id)) rejected.push({ model: ref.from, ordinal: ref.ordinal, reason: 'Missing referenced ' + ref.target });
  return { specs, header, counts, rejected, digests, indexMappings, sourceHash: await fileHash(file) };
}
async function exportSource(file, evidenceFile) {
  const evidence = JSON.parse(fs.readFileSync(evidenceFile, 'utf8')); backupEvidence(evidence);
  if (process.env.MIGRATION_SOURCE_IS_ISOLATED_RESTORE !== 'true' || !process.env.MIGRATION_SOURCE_URI) throw new Error('Provide a read-only MIGRATION_SOURCE_URI for the verified isolated restore and confirm MIGRATION_SOURCE_IS_ISOLATED_RESTORE=true.');
  const client = new mongoose.mongo.MongoClient(process.env.MIGRATION_SOURCE_URI, { serverSelectionTimeoutMS: 8000, readPreference: 'primary' });
  const handle = await fs.promises.open(file, 'wx', 0o600);
  try {
    await client.connect(); const db = client.db();
    if (db.databaseName !== evidence.restoredDatabase) throw new Error('Source database does not match verified isolated restore evidence.');
    const specs = catalog(), byCollection = new Map(specs.map(s => [s.model.collection.collectionName, s]));
    const collections = await db.listCollections({}, { nameOnly: false }).toArray();
    if (collections.some(c => !c.name.startsWith('system.') && !byCollection.has(c.name))) throw new Error('Unknown source collections must be mapped before export.');
    const collectionMetadata = [];
    for (const c of collections.filter(c => !c.name.startsWith('system.'))) collectionMetadata.push({ name: c.name, options: c.options, indexes: await db.collection(c.name).listIndexes().toArray() });
    await handle.write(EJSON.stringify({ format: 'miu-sqlserver-export-v1', exportedAt: new Date(), backup: evidence, models: specs.map(s => s.name), collectionMetadata }) + '\n');
    const counts = Object.fromEntries(specs.map(s => [s.name, 0]));
    // The restored source MUST be frozen/read-only throughout extraction. This
    // tool intentionally does not claim to make a live changing source consistent.
    for (const spec of specs) {
      for await (const document of db.collection(spec.model.collection.collectionName).find({}).sort({ _id: 1 })) {
        await handle.write(EJSON.stringify({ model: spec.name, document }) + '\n'); counts[spec.name]++;
      }
    }
    await handle.write(EJSON.stringify({ end: true, counts }) + '\n');
  } finally { await handle.close(); await client.close(); }
}
async function verifyTarget(audit) {
  const counts = {}; let mismatches = 0;
  for (const spec of audit.specs) {
    counts[spec.name] = 0;
    let lastId = '';
    while (true) {
      const batch = await runtime.request().input('lastId', lastId).query(`SELECT TOP (250) * FROM ${spec.table} WHERE [_id] > @lastId ORDER BY [_id];`);
      if (!batch.recordset.length) break;
      for (const row of batch.recordset) {
        counts[spec.name]++;
        const document = EJSON.parse(row._payload);
        if (audit.digests[spec.name].get(String(row._id)) !== hash(canonical(document))) mismatches++;
        for (const [key, expected] of Object.entries(stored(spec, document))) {
          if (key === '_payload') continue;
          const column = spec.columns.find(c => c.name === key);
          const actual = (column?.type === 'BIGINT' || key === '_clubReference') && row[key] != null ? Number(row[key]) : row[key];
          if (canonical(expected) !== canonical(actual)) mismatches++;
        }
        lastId = row._id;
      }
    }
    if (counts[spec.name] !== audit.counts[spec.name]) mismatches++;
  }
  // DBCC CHECKCONSTRAINTS can fail while constructing diagnostic strings when
  // database and binary identifier collations differ (SQL 2025 error 446/2509).
  // Have the engine validate every row and mark constraints trusted instead.
  for (const spec of audit.specs) await runtime.request().query(`ALTER TABLE ${spec.table} WITH CHECK CHECK CONSTRAINT ALL;`);
  const constraints = await runtime.request().query('SELECT COUNT(*) AS [invalidConstraints] FROM (SELECT [is_disabled], [is_not_trusted] FROM sys.check_constraints UNION ALL SELECT [is_disabled], [is_not_trusted] FROM sys.foreign_keys) AS [constraintState] WHERE [is_disabled] = 1 OR [is_not_trusted] = 1;');
  mismatches += Number(constraints.recordset[0]?.invalidConstraints ?? 1);
  return { counts, mismatches, passed: mismatches === 0 };
}
async function importSource(file, audit) {
  targetGate();
  if (audit.rejected.length) throw new Error('Preflight rejected records. No import is permitted.');
  if (await fileHash(file) !== audit.sourceHash) throw new Error('Export changed after preflight.');
  await runtime.connect({ readiness: false });
  const state = (await runtime.request().query('SELECT * FROM [dbo].[PlatformDatabaseState] WHERE [id]=1;')).recordset[0];
  if (state?.version !== 1) throw new Error('Target schema version is not supported.');
  if (state.validatedAt) {
    if (state.sourceHash !== audit.sourceHash) throw new Error('A different source was already promoted. Refusing overwrite.');
    const validated = await verifyTarget(audit);
    if (!validated.passed) throw new Error('Previously promoted data changed; refusing to overwrite it.');
    return { inserted: 0, unchanged: Object.values(audit.counts).reduce((a, b) => a + b, 0), validation: validated };
  }
  const runId = hash('schema-v1:' + audit.sourceHash);
  const prior = await runtime.request().input('runId', runId).query('SELECT [runId] FROM [dbo].[PlatformMigrationRun] WHERE [runId]=@runId;');
  if (!prior.recordset.length) {
    const existing = await runtime.request().query('SELECT COUNT(*) AS count FROM [dbo].[PlatformMigrationRun];');
    if (existing.recordset[0].count) throw new Error('Target belongs to another migration source. Use a separate empty database.');
    for (const spec of audit.specs) if ((await runtime.request().query(`SELECT TOP (1) [_id] FROM ${spec.table};`)).recordset.length) throw new Error('Target has pre-existing application data. Refusing import.');
    await runtime.request().input('runId', runId).input('sourceHash', audit.sourceHash).query("INSERT INTO [dbo].[PlatformMigrationRun] ([runId],[sourceHash],[status]) VALUES (@runId,@sourceHash,N'importing');");
  }
  let inserted = 0, unchanged = 0;
  const specs = new Map(audit.specs.map(s => [s.name, s]));
  for await (const entry of entries(file)) {
    if (!entry.model) continue;
    const spec = specs.get(entry.model), data = entry.document, id = String(data._id), digest = hash(canonical(data));
    if (audit.digests[spec.name].get(id) !== digest) throw new Error('Export content changed during import.');
    await runtime.transaction(null, async session => {
      const priorItem = await runtime.request(session).input('runId', runId).input('model', spec.name).input('id', id).query('SELECT [sourceHash] FROM [dbo].[PlatformMigrationItem] WHERE [runId]=@runId AND [model]=@model AND [documentId]=@id;');
      if (priorItem.recordset.length) {
        if (priorItem.recordset[0].sourceHash !== digest) throw new Error('Migration resume fingerprint conflict.');
        const saved = await runtime.request(session).input('id', id).query(`SELECT [_payload] FROM ${spec.table} WHERE [_id]=@id;`);
        if (!saved.recordset[0] || hash(canonical(EJSON.parse(saved.recordset[0]._payload))) !== digest) throw new Error('Previously committed migration record changed.');
        unchanged++; return;
      }
      await write(spec, data, 0, session, true);
      await runtime.request(session).input('runId', runId).input('model', spec.name).input('id', id).input('digest', digest).query('INSERT INTO [dbo].[PlatformMigrationItem] ([runId],[model],[documentId],[sourceHash]) VALUES (@runId,@model,@id,@digest);');
      inserted++;
    });
  }
  if (await fileHash(file) !== audit.sourceHash) throw new Error('Export changed during import. Target remains unvalidated.');
  const validation = await verifyTarget(audit);
  if (!validation.passed) throw new Error('Migration reconciliation failed. Target remains unvalidated.');
  // The CLI persists the private report BEFORE creating the readiness marker.
  // A failed report write must never enable a target database.
  return { inserted, unchanged, validation, runId };
}
async function main() {
  const [action] = process.argv.slice(2);
  if (action === '--schema') {
    targetGate();
    if (process.env.ALLOW_SQLSERVER_SCHEMA !== 'CREATE_EMPTY_TARGET') throw new Error('Set ALLOW_SQLSERVER_SCHEMA=CREATE_EMPTY_TARGET for the verified empty staging target.');
    await runtime.connect({ readiness: false });
    await runtime.request().batch(require('./sqlserver-schema.cjs').schemaSql());
    console.log('SQL schema v1 applied to the explicitly selected empty target.'); return;
  }
  if (!['--export', '--dry-run', '--import', '--validate'].includes(action)) throw new Error('Usage: sqlserver-migrate.cjs --schema|--export|--dry-run|--import|--validate. See database/README.md.');
  const file = protectedPath(process.env.MIGRATION_EXPORT_FILE);
  if (action === '--export') { await exportSource(file, protectedPath(process.env.MIGRATION_BACKUP_EVIDENCE_FILE)); console.log('Private source export completed. Run --dry-run next.'); return; }
  const reportFile = protectedPath(process.env.MIGRATION_REPORT_FILE);
  if (reportFile === file || fs.existsSync(reportFile)) throw new Error('Choose a new report file; existing artifacts are never overwritten.');
  const audit = await preflight(file);
  const report = { schemaVersion: 1, sourceHash: audit.sourceHash, counts: audit.counts, rejected: audit.rejected, action, checkedAt: new Date().toISOString() };
  try {
    if (action === '--import') report.result = await importSource(file, audit);
    if (action === '--validate') { targetGate(); if (audit.rejected.length) throw new Error('Source preflight failed.'); await runtime.connect({ readiness: false }); report.result = await verifyTarget(audit); }
  } catch (error) {
    report.failure = { code: error.code || error.name, passed: false };
    await fs.promises.writeFile(reportFile, JSON.stringify(report, null, 2), { flag: 'wx', mode: 0o600 });
    throw error;
  }
  const reportText = JSON.stringify(report, null, 2);
  await fs.promises.writeFile(reportFile, reportText, { flag: 'wx', mode: 0o600 });
  if (action === '--import' && report.result?.runId && report.result.validation.passed) {
    await runtime.transaction(null, async session => {
      await runtime.request(session).input('sourceHash', audit.sourceHash).input('reportHash', hash(reportText)).query('UPDATE [dbo].[PlatformDatabaseState] SET [validatedAt]=SYSUTCDATETIME(), [sourceHash]=@sourceHash, [validationReportHash]=@reportHash WHERE [id]=1;');
      await runtime.request(session).input('runId', report.result.runId).query("UPDATE [dbo].[PlatformMigrationRun] SET [status]=N'validated', [completedAt]=SYSUTCDATETIME() WHERE [runId]=@runId;");
    });
  }
  console.log(JSON.stringify({ action, records: Object.values(audit.counts).reduce((a, b) => a + b, 0), rejected: audit.rejected.length, passed: !audit.rejected.length && report.result?.validation?.passed !== false && report.result?.passed !== false }));
  if (audit.rejected.length || report.result?.passed === false) process.exitCode = 1;
}
if (require.main === module) main().catch(error => { console.error('SQL migration stopped:', error.code || error.name, 'Review the private configuration and migration instructions. Target is never automatically enabled after failure.'); process.exitCode = 1; }).finally(() => runtime.disconnect());
module.exports = { canonical, preflight, verifyTarget, importSource, exportSource, protectedPath, backupEvidence, targetGate };
