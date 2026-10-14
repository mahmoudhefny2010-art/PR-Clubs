const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
require('dotenv').config({ path: path.join(root, '.env'), quiet: true });
const { provider, sqlConfig } = require('../database/config');
const { catalog } = require('../database/catalog');
const { identifier } = require('../database/schema');
const sql = require('mssql');

function ttlTargets(specs = catalog()) {
  return specs.flatMap(spec => {
    const indexes = spec.indexes.filter(i => i.options.expireAfterSeconds === 0 || i.options.expires === 0);
    if (!indexes.length) return [];
    if (indexes.some(i => Object.keys(i.keys).length !== 1 || i.keys.expiresAt !== 1)
      || !spec.columns.some(c => c.name === 'expiresAt' && c.path.instance === 'Date')) {
      throw new Error('Unreviewed TTL definition: ' + spec.name);
    }
    return [{ name: spec.name, table: `[dbo].${identifier(spec.name)}` }];
  });
}
function localProfile(expectedDatabase) {
  if (provider() !== 'sqlserver') throw new Error('Local SQL operations require the sqlserver provider.');
  const config = sqlConfig();
  const local = ['localhost', '127.0.0.1', '::1', require('node:os').hostname().toLowerCase()];
  if (!local.includes(config.server.toLowerCase())) throw new Error('Local SQL operations require a local SQL Server.');
  if (!expectedDatabase || config.database !== expectedDatabase) throw new Error('Scheduled database does not match the active configuration.');
  return { ...config, requestTimeout: 30 * 60 * 1000 };
}
function backupName(database) {
  if (!/^[A-Za-z0-9_-]+$/.test(database)) throw new Error('Unsupported backup database name.');
  return `${database}_auto_${new Date().toISOString().replace(/[:.]/g, '-')}_${crypto.randomBytes(6).toString('hex')}.bak`;
}
async function verifiedBackups(directory, database) {
  if (!/^[A-Za-z0-9_-]+$/.test(database)) throw new Error('Unsupported backup database name.');
  const names = await fs.readdir(directory);
  const pattern = new RegExp(`^${database}_auto_[0-9TZA-Fa-f_-]+\\.bak\\.verified\\.json$`);
  const result = [];
  for (const name of names.filter(n => pattern.test(n))) {
    try {
      const entry = JSON.parse(await fs.readFile(path.join(directory, name), 'utf8'));
      const file = name.slice(0, -'.verified.json'.length);
      const stat = await fs.lstat(path.join(directory, file));
      if (stat.isFile() && !stat.isSymbolicLink() && entry.database === database && entry.file === file
        && entry.checksumVerified === true && stat.size === entry.bytes && Number.isFinite(Date.parse(entry.verifiedAt))) {
        result.push({ ...entry, marker: name });
      }
    } catch { /* Incomplete/unverified files are never candidates for deletion. */ }
  }
  return result.sort((a, b) => Date.parse(b.verifiedAt) - Date.parse(a.verifiedAt));
}
async function backup(pool, database, directory) {
  const file = backupName(database), destination = path.join(directory, file);
  await pool.request().input('database', sql.NVarChar, database).input('destination', sql.NVarChar, destination)
    .query('BACKUP DATABASE @database TO DISK = @destination WITH COPY_ONLY, CHECKSUM, COMPRESSION;');
  await pool.request().input('destination', sql.NVarChar, destination)
    .query('RESTORE VERIFYONLY FROM DISK = @destination WITH CHECKSUM;');
  const stat = await fs.stat(destination);
  const evidence = { database, file, bytes: stat.size, checksumVerified: true, verifiedAt: new Date().toISOString() };
  await fs.writeFile(destination + '.verified.json', JSON.stringify(evidence, null, 2) + '\n', { flag: 'wx' });
  // Keep at least two verified backups, regardless of age. Never touch other files.
  const entries = await verifiedBackups(directory, database);
  for (const entry of entries.slice(2)) {
    if (Date.parse(entry.verifiedAt) >= Date.now() - 14 * 86400000) continue;
    await fs.unlink(path.join(directory, entry.file));
    await fs.unlink(path.join(directory, entry.marker));
  }
  return evidence;
}
async function cleanup(pool, { dryRun = false } = {}) {
  const result = {};
  for (const target of ttlTargets()) {
    if (dryRun) {
      result[target.name] = (await pool.request().query(`SELECT COUNT(*) AS count FROM ${target.table} WHERE [expiresAt] <= SYSUTCDATETIME();`)).recordset[0].count;
      continue;
    }
    let total = 0, deleted;
    do {
      const tx = new sql.Transaction(pool);
      await tx.begin();
      try {
        const r = await new sql.Request(tx).query(`SET XACT_ABORT ON; DECLARE @lock INT;
EXEC @lock = sys.sp_getapplock @Resource=N'miu-platform-write-v1', @LockMode='Exclusive', @LockOwner='Transaction', @LockTimeout=15000;
IF @lock < 0 THROW 51000, 'Platform write lock unavailable.', 1;
DELETE TOP (500) FROM ${target.table} WHERE [expiresAt] <= SYSUTCDATETIME(); SELECT @@ROWCOUNT AS deleted;`);
        deleted = r.recordset[0].deleted;
        await tx.commit(); total += deleted;
      } catch (error) { await tx.rollback().catch(() => {}); throw error; }
    } while (deleted === 500 && total < 10000);
    result[target.name] = total;
  }
  return result;
}
async function main(args = process.argv.slice(2)) {
  const mode = args[0];
  const option = key => args[args.indexOf(key) + 1];
  if (!['backup', 'cleanup', 'cleanup-preview'].includes(mode) || !args.includes('--directory') || !args.includes('--database')) throw new Error('Use backup|cleanup|cleanup-preview --directory <private path> --database <name>.');
  const directory = await fs.realpath(path.resolve(option('--directory')));
  const database = option('--database'), config = localProfile(database);
  // Refuse to maintain a database that has not passed application migration validation.
  const runtime = require('../database/runtime');
  await runtime.connect(); await runtime.disconnect();
  let pool;
  try {
    pool = await new sql.ConnectionPool(config).connect();
    let result;
    if (mode === 'backup') result = await backup(pool, database, directory);
    else {
      if (mode === 'cleanup') {
        const backups = await verifiedBackups(directory, database);
        if (!backups[0] || Date.now() - Date.parse(backups[0].verifiedAt) > 36 * 3600000) throw new Error('A verified backup from the last 36 hours is required before automatic cleanup.');
      }
      result = await cleanup(pool, { dryRun: mode === 'cleanup-preview' });
    }
    await fs.appendFile(path.join(directory, '..', 'operations.jsonl'), JSON.stringify({ at: new Date().toISOString(), mode, database, ok: true, result }) + '\n');
    console.log(JSON.stringify({ mode, database, ok: true, result }));
  } catch (error) {
    await fs.appendFile(path.join(directory, '..', 'operations.jsonl'), JSON.stringify({ at: new Date().toISOString(), mode, database, ok: false, error: error.code || error.name }) + '\n').catch(() => {});
    throw error;
  } finally { await pool?.close(); }
}
if (require.main === module) main().catch(error => { console.error('SQL operation failed:', error.code || error.name, error.code ? '' : error.message); process.exitCode = 1; });
module.exports = { backup, cleanup, ttlTargets, verifiedBackups, backupName, localProfile, main };
