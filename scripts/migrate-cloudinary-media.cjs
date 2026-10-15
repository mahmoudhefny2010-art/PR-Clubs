const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const os = require('node:os');
const root = path.resolve(__dirname, '..');
require('dotenv').config({ path: path.join(root, '.env'), quiet: true });
const { provider, sqlConfig } = require('../database/config');
const { getCloudinaryCredentials } = require('../services/cloudinary-config');
const migration = require('../services/media-storage-migration');
const runtime = require('../database/runtime');

async function saveJournal(file, journal) {
  const temporary = file + '.next';
  const handle = await fs.open(temporary, 'w', 0o600);
  try { await handle.writeFile(JSON.stringify(journal, null, 2) + '\n'); await handle.sync(); }
  finally { await handle.close(); }
  await fs.rename(temporary, file);
}
async function verifyBackup(file, database) {
  if (!file || !path.isAbsolute(file)) throw new Error('A verified native backup path is required.');
  const [stat, markerStat] = await Promise.all([fs.lstat(file), fs.lstat(file + '.verified.json')]);
  const marker = JSON.parse(await fs.readFile(file + '.verified.json', 'utf8'));
  const age = Date.now() - Date.parse(marker.verifiedAt);
  if (!stat.isFile() || stat.isSymbolicLink() || !markerStat.isFile() || markerStat.isSymbolicLink()
    || marker.database !== database || marker.file !== path.basename(file) || marker.bytes !== stat.size
    || marker.checksumVerified !== true || !Number.isFinite(age) || age < 0 || age > 2 * 3600000) throw new Error('A checksum-verified backup from the last two hours is required.');
  return marker;
}
async function main(args = process.argv.slice(2)) {
  const option = name => args.includes(name) ? args[args.indexOf(name) + 1] : undefined;
  const config = sqlConfig();
  if (provider() !== 'sqlserver' || process.env.NODE_ENV === 'production' || process.env.VERCEL
    || option('--database') !== config.database || !['localhost', '127.0.0.1', '::1', os.hostname().toLowerCase()].includes(config.server.toLowerCase())) throw new Error('Pin this migration to the explicitly configured local SQL database.');
  const credentials = getCloudinaryCredentials();
  if (!credentials) throw new Error('Cloudinary credentials are not configured.');
  const models = { ...require('../models'), AccountPhoto: require('../services/account-photo').AccountPhoto };
  let session, journal, journalPath;
  try {
    await runtime.connect();
    if (args.includes('--rollback')) {
      const file = option('--rollback');
      if (!path.isAbsolute(file || '')) throw new Error('Use an absolute migration journal path.');
      journal = JSON.parse(await fs.readFile(file, 'utf8'));
      if (journal.version !== 1 || journal.database !== config.database || journal.state !== 'committed') throw new Error('Only a committed matching migration journal can be rolled back.');
      await verifyBackup(option('--backup'), config.database);
      session = new runtime.Session(); await session.begin();
      await migration.applyChanges(models, journal.changes, session, { rollback: true });
      await session.commitTransaction();
      journal.state = 'rolled-back'; journal.rolledBackAt = new Date().toISOString(); await saveJournal(file, journal);
      console.log(JSON.stringify({ ok: true, rolledBackRecords: journal.changes.length })); return;
    }
    const completePlan = await migration.makePlan(models, { cloudName: credentials.cloud_name, publicRoot: path.join(root, 'public') });
    const plan = args.includes('--public-only') ? migration.publicPlan(completePlan) : completePlan;
    const summary = migration.summarize(plan);
    console.log(JSON.stringify({ mode: args.includes('--apply') ? 'apply' : 'plan', database: config.database, ...summary }));
    if (!args.includes('--apply')) return;
    if (summary.privateReferences && !args.includes('--include-private-media')) throw new Error('Explicit consent and --include-private-media are required to export applicant or unpublished media.');
    if (plan.errors.length) throw new Error('Resolve the reported media sources before migration. No records were changed.');
    if (!plan.references.length) { console.log(JSON.stringify({ ok: true, alreadyMigrated: true })); return; }
    const backup = await verifyBackup(option('--backup'), config.database);
    const directory = option('--directory');
    if (!path.isAbsolute(directory || '')) throw new Error('Use an existing protected absolute journal directory outside the workspace.');
    const actualDirectory = await fs.realpath(directory), relative = path.relative(root, actualDirectory);
    if (!relative || !relative.startsWith('..') && !path.isAbsolute(relative)) throw new Error('Store the migration journal outside the workspace.');
    const run = 'media-migration-' + new Date().toISOString().replace(/[:.]/g, '-') + '-' + crypto.randomBytes(4).toString('hex');
    const runDirectory = path.join(actualDirectory, run); await fs.mkdir(runDirectory, { mode: 0o700 });
    journalPath = path.join(runDirectory, 'journal.json');
    journal = { version: 1, database: config.database, cloudName: credentials.cloud_name, run, state: 'uploading', scope: args.includes('--public-only') ? 'public-only' : 'all-media', explicitPrivateMediaConsent: args.includes('--include-private-media'), startedAt: new Date().toISOString(), backup: backup.file, summary, uploads: {}, changes: [] };
    await saveJournal(journalPath, journal);
    const cloudinary = require('cloudinary').v2; cloudinary.config({ ...credentials, secure: true });
    if ((await cloudinary.api.ping({ timeout: 15000 })).status !== 'ok') throw new Error('Cloudinary connection check failed.');
    for (const asset of plan.assets) {
      journal.uploads[asset.key] = await migration.uploadAsset(cloudinary, asset, credentials.cloud_name);
      await saveJournal(journalPath, journal);
      console.log(JSON.stringify({ uploadedAndVerified: Object.keys(journal.uploads).length, total: plan.assets.length }));
    }
    journal.changes = migration.changesFor(plan, journal.uploads); journal.state = 'prepared';
    await saveJournal(journalPath, journal); // Durable previous values before any SQL write.
    session = new runtime.Session(); await session.begin();
    await migration.applyChanges(models, journal.changes, session);
    await models.AuditLog.create([{ id: crypto.randomBytes(6).readUIntBE(0, 6), actorEmail: process.env.ADMIN_EMAIL || 'local-operator', actorRole: 'admin', action: 'MEDIA_MIGRATION', targetType: 'media', targetId: '', details: JSON.stringify({ run, records: journal.changes.length, references: plan.references.length, assets: plan.assets.length }), timestamp: new Date() }], { session });
    await session.commitTransaction();
    journal.state = 'committed'; journal.committedAt = new Date().toISOString(); await saveJournal(journalPath, journal);
    const remainingAll = await migration.makePlan(models, { cloudName: credentials.cloud_name, publicRoot: path.join(root, 'public') });
    const remaining = args.includes('--public-only') ? migration.publicPlan(remainingAll) : remainingAll;
    journal.verification = migration.summarize(remaining); await saveJournal(journalPath, journal);
    if (remaining.references.length || remaining.errors.length) throw new Error('Migration committed, but new or unresolved media needs review. Consult the protected journal.');
    console.log(JSON.stringify({ ok: true, recordsUpdated: journal.changes.length, referencesMigrated: plan.references.length, assetsVerified: plan.assets.length, remainingLegacyReferences: 0, journal: journalPath }));
  } catch (error) {
    await session?.abortTransaction().catch(() => {});
    if (journal && journalPath) {
      journal.failure = { at: new Date().toISOString(), code: error.code || error.http_code || error.name };
      await saveJournal(journalPath, journal).catch(() => {});
    }
    throw error;
  } finally { await session?.endSession(); await runtime.disconnect(); }
}
if (require.main === module) main().catch(error => { console.error('Media migration failed:', error.code || error.http_code || error.name); process.exitCode = 1; });
module.exports = { main, verifyBackup };
