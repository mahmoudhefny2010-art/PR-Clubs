require('dotenv').config({ quiet: true });
const fs = require('node:fs');
const path = require('node:path');
const sql = require('mssql');
const { provider, sqlConfig, isSqlProvider } = require('../database/config');
async function main() {
  if (!process.argv.includes('--apply')) throw new Error('Use --apply --database <configured database>.');
  if (!isSqlProvider(provider())) throw new Error('Select a SQL provider first.');
  const config = sqlConfig();
  const expected = process.argv[process.argv.indexOf('--database') + 1];
  if (!process.argv.includes('--database') || expected !== config.database) throw new Error('Explicit database name must match the configured target.');
  if (process.env.SQLSERVER_OPERATIONS_USER || process.env.SQLSERVER_OPERATIONS_PASSWORD) {
    if (!process.env.SQLSERVER_OPERATIONS_USER || !process.env.SQLSERVER_OPERATIONS_PASSWORD) throw new Error('Both SQL operations credentials are required.');
    config.user = process.env.SQLSERVER_OPERATIONS_USER;
    config.password = process.env.SQLSERVER_OPERATIONS_PASSWORD;
  }
  config.connectionTimeout = Math.max(config.connectionTimeout, 30000);
  const pool = await new sql.ConnectionPool(config).connect();
  try {
    await pool.request().batch(fs.readFileSync(path.join(__dirname, '../database/migrations/005-staff-speaker-invites.sql'), 'utf8'));
    console.log('Supervisor speaker invitations enabled; existing invitations unchanged.');
  } finally { await pool.close(); }
}
if (require.main === module) main().catch(error => { console.error('Speaker invitation migration failed:', error.code || error.name); process.exitCode = 1; });
