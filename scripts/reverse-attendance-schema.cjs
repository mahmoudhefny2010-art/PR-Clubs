require('dotenv').config();
const fs = require('node:fs'), path = require('node:path');
const db = require('../database');
const { AttendanceRecord, StudentAccount, EventRegistration } = require('../models');
const { AttendanceDeviceBinding } = require('../services/attendance-device-model');
const { describe, createTable } = require('../database/schema');
const file = path.join(__dirname, '../database/migrations/009-reverse-attendance.sql');
function migration() {
  const binding = describe(AttendanceDeviceBinding), index = describe(AttendanceRecord).indexes.find(item => item.keys.accountEventKey);
  const registration = describe(EventRegistration), stable = registration.indexes.find(item => item.keys.eventRequestId), position = registration.indexes.find(item => item.keys.eventIndex);
  return `SET XACT_ABORT ON;
BEGIN TRANSACTION;
IF OBJECT_ID(N'dbo.AttendanceDeviceBinding',N'U') IS NULL BEGIN
${createTable(binding)}
END;
IF COL_LENGTH(N'dbo.AttendanceRecord',N'accountEventKey') IS NULL
  ALTER TABLE dbo.AttendanceRecord ADD accountEventKey NVARCHAR(254) COLLATE Latin1_General_100_BIN2 NULL;
IF COL_LENGTH(N'dbo.AttendanceRecord',N'_has_accountEventKey') IS NULL
  ALTER TABLE dbo.AttendanceRecord ADD _has_accountEventKey BIT NOT NULL CONSTRAINT DF_AttendanceRecord_HasAccountEventKey DEFAULT 0;
IF NOT EXISTS(SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.AttendanceRecord') AND name=N'${index.name}')
  EXEC(N'CREATE UNIQUE NONCLUSTERED INDEX [${index.name}] ON dbo.AttendanceRecord(accountEventKey) WHERE _has_accountEventKey=1');
IF DATABASE_PRINCIPAL_ID(N'miu_runtime_v1') IS NOT NULL GRANT SELECT,INSERT,UPDATE,DELETE ON OBJECT::dbo.AttendanceDeviceBinding TO miu_runtime_v1;
IF NOT EXISTS(SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.EventRegistration') AND name=N'${stable.name}')
  CREATE UNIQUE NONCLUSTERED INDEX [${stable.name}] ON dbo.EventRegistration(clubId,eventRequestId,email) WHERE eventRequestId IS NOT NULL;
IF EXISTS(SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.EventRegistration') AND name=N'${position.name}' AND is_unique=1)
  DROP INDEX [${position.name}] ON dbo.EventRegistration;
IF NOT EXISTS(SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.EventRegistration') AND name=N'${position.name}')
  CREATE NONCLUSTERED INDEX [${position.name}] ON dbo.EventRegistration(clubId,eventIndex,email);
COMMIT TRANSACTION;
`;
}
async function backfill() {
  const migrated = await require('../services/attendance-legacy-migration').migrateLegacyEvents(require('../models'), db);
  const university = await EventRegistration.find({ clubId: 0, eventRequestId: { $exists: false } }).select('_id eventIndex').lean();
  for (const row of university) await EventRegistration.updateOne({ _id: row._id, eventRequestId: { $exists: false } }, { $set: { eventRequestId: row.eventIndex } });
  const students = await StudentAccount.find({}).select('_id email').lean();
  const byEmail = new Map(students.map(student => [student.email.toLowerCase(), String(student._id)]));
  const rows = await AttendanceRecord.find({}).select('_id clubId itemType eventRequestId email accountEventKey').lean(), keys = new Map(), changes = [];
  for (const row of rows) {
    if (row.itemType !== 'event' || !byEmail.has(row.email.toLowerCase())) continue;
    const key = `${row.clubId === 0 ? 'miu' : 'club'}:${row.clubId}:${row.eventRequestId}:${byEmail.get(row.email.toLowerCase())}`;
    if (keys.has(key) && keys.get(key) !== String(row._id)) throw new Error('Historical duplicate account/event records require an audited manual review. Nothing was deleted.');
    keys.set(key, String(row._id));
    if (!row.accountEventKey) changes.push([row._id, key]);
  }
  const session = await db.startSession();
  try { await session.withTransaction(async () => { for (const [id, key] of changes) await AttendanceRecord.updateOne({ _id: id, accountEventKey: { $exists: false } }, { $set: { accountEventKey: key } }, { session }); }); }
  finally { await session.endSession(); }
  console.log(`Legacy events given stable identities: ${migrated}. Attendance account references backfilled: ${changes.length}. Historical times and student IDs preserved.`);
}
async function main() {
  if (process.argv.includes('--generate')) { fs.writeFileSync(file, migration()); console.log('Reverse attendance migration generated; no database changed.'); return; }
  if (!process.argv.includes('--apply') && !process.argv.includes('--backfill')) throw new Error('Choose --generate, --apply or --backfill.');
  if (db.isSqlProvider) require('./sqlserver-migrate.cjs').targetGate();
  else if (process.env.NODE_ENV === 'production') throw new Error('Run migrations from an explicitly controlled migration environment, not the production web process.');
  if (db.isSqlProvider && process.argv.includes('--apply')) {
    require('./sqlserver-migrate.cjs').targetGate();
    const sql = require('mssql'), { sqlConfig, sqlPrefix } = require('../database/config');
    const config = sqlConfig(), prefix = sqlPrefix();
    if (process.env[prefix+'_OPERATIONS_USER'] || process.env[prefix+'_OPERATIONS_PASSWORD']) { if (!process.env[prefix+'_OPERATIONS_USER'] || !process.env[prefix+'_OPERATIONS_PASSWORD']) throw new Error('Both operations credentials are required.'); config.user = process.env[prefix+'_OPERATIONS_USER']; config.password = process.env[prefix+'_OPERATIONS_PASSWORD']; }
    const pool = await new sql.ConnectionPool(config).connect();
    try { await pool.request().batch(fs.readFileSync(file,'utf8')); console.log('Reverse attendance SQL schema applied without deleting records.'); } finally { await pool.close(); }
  } else {
    try { await db.connect(process.env.MONGO_URI || process.env.MONGODB_URI); if (process.argv.includes('--apply')) {
      await AttendanceRecord.createIndexes(); await AttendanceDeviceBinding.createIndexes();
      const stable = EventRegistration.schema.indexes().find(([keys]) => keys.eventRequestId);
      await EventRegistration.collection.createIndex(stable[0],stable[1]);
      const indexes = await EventRegistration.collection.indexes();
      for (const index of indexes) if (index.unique && JSON.stringify(index.key) === JSON.stringify({clubId:1,eventIndex:1,email:1})) await EventRegistration.collection.dropIndex(index.name);
      await EventRegistration.createIndexes(); console.log('Reverse attendance MongoDB indexes ensured.');
    } if (process.argv.includes('--backfill')) await backfill(); }
    finally { await db.disconnect(); }
  }
}
if (require.main === module) main().catch(error => { console.error('Reverse attendance migration failed:', error.code || error.name, error.message); process.exitCode=1; });
module.exports = { migration, backfill };
