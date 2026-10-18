require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const sql = require('mssql');
const { provider, isSqlProvider, sqlConfig } = require('../database/config');
const { targetGate } = require('./sqlserver-migrate.cjs');
async function main() {
  if (!process.argv.includes('--apply')) throw new Error('Use --apply to add quiz storage to the configured isolated SQL target.');
  targetGate();
  if (!isSqlProvider(provider())) throw new Error('Select a SQL provider first.');
  const config = sqlConfig();
  if (process.env.SQLSERVER_OPERATIONS_USER || process.env.SQLSERVER_OPERATIONS_PASSWORD) {
    if (!process.env.SQLSERVER_OPERATIONS_USER || !process.env.SQLSERVER_OPERATIONS_PASSWORD) throw new Error('Both SQL operations credentials are required.');
    config.user = process.env.SQLSERVER_OPERATIONS_USER;
    config.password = process.env.SQLSERVER_OPERATIONS_PASSWORD;
  }
  const pool = await new sql.ConnectionPool(config).connect();
  try {
    await pool.request().batch(fs.readFileSync(path.join(__dirname, '../database/migrations/006-quiz-submissions.sql'), 'utf8'));
    console.log('Quiz analytics SQL table is ready. Existing data was preserved.');
  } finally { await pool.close(); }
}
main().catch(error => { console.error('Quiz schema migration failed:', error.code || error.name, error.message); process.exitCode = 1; });
