require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const sql = require('mssql');
const { sqlConfig, sqlPrefix, provider, isSqlProvider } = require('../database/config');
const { targetGate } = require('./sqlserver-migrate.cjs');
const { describe, createTable } = require('../database/schema');
function migration() {
  const models = require('../services/workflow-models');
  return 'SET XACT_ABORT ON;\nBEGIN TRANSACTION;\n' + Object.values(models).map(model => {
    const spec = describe(model);
    return `IF OBJECT_ID(N'dbo.${spec.name}',N'U') IS NULL\nBEGIN\n${createTable(spec)}\nEND;\nIF DATABASE_PRINCIPAL_ID(N'miu_runtime_v1') IS NOT NULL GRANT SELECT, INSERT, UPDATE, DELETE ON OBJECT::${spec.table} TO [miu_runtime_v1];`;
  }).join('\n') + '\nCOMMIT TRANSACTION;\n';
}
async function main() {
  const file = path.join(__dirname, '../database/migrations/007-workflows.sql');
  if (process.argv.includes('--generate')) { fs.writeFileSync(file, migration()); console.log('Workflow SQL migration generated; not applied.'); return; }
  if (!process.argv.includes('--apply')) throw new Error('Choose --generate or --apply.');
  targetGate();
  if (!isSqlProvider(provider())) throw new Error('Select a SQL provider first.');
  const config = sqlConfig(), prefix = sqlPrefix();
  if (process.env[prefix + '_OPERATIONS_USER'] || process.env[prefix + '_OPERATIONS_PASSWORD']) {
    if (!process.env[prefix + '_OPERATIONS_USER'] || !process.env[prefix + '_OPERATIONS_PASSWORD']) throw new Error('Configure both protected operations credentials.');
    config.user = process.env[prefix + '_OPERATIONS_USER']; config.password = process.env[prefix + '_OPERATIONS_PASSWORD'];
  }
  config.connectionTimeout = Math.max(30000, config.connectionTimeout);
  const pool = await new sql.ConnectionPool(config).connect();
  try { await pool.request().batch(fs.readFileSync(file, 'utf8')); console.log('Workflow tables installed; existing requests and audit permissions preserved.'); }
  finally { await pool.close(); }
}
if (require.main === module) main().catch(error => { console.error('Workflow migration failed:', error.code || error.name); process.exitCode = 1; });
module.exports = { migration };
