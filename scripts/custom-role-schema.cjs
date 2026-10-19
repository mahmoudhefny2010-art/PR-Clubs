require('dotenv').config();
const fs = require('node:fs'), path = require('node:path');
const sql = require('mssql');
const { sqlConfig, sqlPrefix, provider, isSqlProvider } = require('../database/config');
const { targetGate } = require('./sqlserver-migrate.cjs');
const { describe, createTable } = require('../database/schema');
function migration() {
  const spec = describe(require('../services/custom-staff-role-model').CustomStaffRole);
  const builtin = require('../services/staff-role-keys').builtinStaffRoles.map(role => `N'${role}'`).join(',');
  return `SET XACT_ABORT ON;
BEGIN TRANSACTION;
IF OBJECT_ID(N'dbo.CustomStaffRole',N'U') IS NULL
BEGIN
${createTable(spec)}
END;
IF DATABASE_PRINCIPAL_ID(N'miu_runtime_v1') IS NOT NULL GRANT SELECT,INSERT,UPDATE,DELETE ON OBJECT::[dbo].[CustomStaffRole] TO [miu_runtime_v1];
DECLARE @roleChecks NVARCHAR(MAX)=N'';
SELECT @roleChecks=@roleChecks+N'ALTER TABLE [dbo].[ClubAccount] DROP CONSTRAINT '+QUOTENAME([name])+N';'
FROM sys.check_constraints AS c WHERE parent_object_id=OBJECT_ID(N'dbo.ClubAccount') AND (
  c.parent_column_id=COLUMNPROPERTY(c.parent_object_id,N'role',N'ColumnId')
  OR c.[name] IN (N'CK_ClubAccount_Role',N'CK_ClubAccount_StaffRole')
  OR EXISTS (SELECT 1 FROM sys.sql_expression_dependencies AS d WHERE d.referencing_id=c.object_id AND d.referenced_id=c.parent_object_id AND d.referenced_minor_id=COLUMNPROPERTY(c.parent_object_id,N'role',N'ColumnId'))
);
IF LEN(@roleChecks)>0 EXEC sys.sp_executesql @roleChecks;
ALTER TABLE [dbo].[ClubAccount] WITH CHECK ADD CONSTRAINT [CK_ClubAccount_StaffRole]
CHECK ([role] IN (${builtin}) OR ([role] LIKE N'custom[_]%' AND LEN([role]) BETWEEN 8 AND 37 AND [role] NOT LIKE N'%[^a-z_]%' COLLATE Latin1_General_100_BIN2));
COMMIT TRANSACTION;
`;
}
async function main() {
  const file = path.join(__dirname, '../database/migrations/008-custom-staff-roles.sql');
  if (process.argv.includes('--generate')) { fs.writeFileSync(file, migration()); console.log('Custom staff role migration generated.'); return; }
  if (!process.argv.includes('--apply')) throw Error('Choose --generate or --apply.');
  targetGate(); if (!isSqlProvider(provider())) throw Error('Select the configured SQL provider.');
  const config = sqlConfig(), prefix = sqlPrefix();
  if (process.env[prefix + '_OPERATIONS_USER'] || process.env[prefix + '_OPERATIONS_PASSWORD']) {
    if (!process.env[prefix + '_OPERATIONS_USER'] || !process.env[prefix + '_OPERATIONS_PASSWORD']) throw Error('Configure both operations credentials.');
    config.user = process.env[prefix + '_OPERATIONS_USER']; config.password = process.env[prefix + '_OPERATIONS_PASSWORD'];
  }
  config.connectionTimeout = Math.max(config.connectionTimeout, 30000);
  const pool = await new sql.ConnectionPool(config).connect();
  try { await pool.request().batch(fs.readFileSync(file, 'utf8')); console.log('Custom role table and staff-role constraint installed; existing accounts preserved.'); }
  finally { await pool.close(); }
}
if (require.main === module) main().catch(error => { console.error('Custom role migration failed:', error.code || error.name, error.message); process.exitCode = 1; });
module.exports = { migration };
