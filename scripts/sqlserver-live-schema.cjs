// Explicit additive migration for SQL targets created before live notifications.
require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const runtime = require('../database/runtime');
const { notificationSchemaSql } = require('../database/public-revisions');
const { targetGate } = require('./sqlserver-migrate.cjs');
const sql = 'SET XACT_ABORT ON;\nBEGIN TRANSACTION;\n' + notificationSchemaSql() + '\nCOMMIT TRANSACTION;\n';
async function main() {
  if (process.argv.includes('--generate')) {
    fs.writeFileSync(path.resolve(__dirname, '../database/migrations/002-public-live.sql'), sql);
    console.log('Generated SQL public notification migration (offline; not applied).');
    return;
  }
  if (!process.argv.includes('--apply')) throw new Error('Choose --generate or --apply.');
  targetGate();
  await runtime.connect({ readiness: false });
  await runtime.request().batch(sql);
  console.log('SQL public notification migration applied to the configured isolated target.');
}
if (require.main === module) main().catch(error => {
  console.error('SQL notification migration stopped:', error.code || error.name);
  process.exitCode = 1;
}).finally(() => runtime.disconnect());
module.exports = { sql };
