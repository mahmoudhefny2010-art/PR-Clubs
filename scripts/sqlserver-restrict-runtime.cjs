// Explicit local SQL hardening. Never prints passwords or replaces operator credentials.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const dotenv = require('dotenv');
const sql = require('mssql');
const root = path.resolve(__dirname, '..');
dotenv.config({ path: path.join(root, '.env'), quiet: true });
const { provider, sqlConfig } = require('../database/config');
const { identifier } = require('../database/schema');
const { catalog } = require('../database/catalog');
async function privileges(pool) {
  return (await pool.request().query("SELECT IS_SRVROLEMEMBER('sysadmin') AS sysadmin, IS_MEMBER('db_owner') AS dbOwner, HAS_PERMS_BY_NAME(DB_NAME(),'DATABASE','CONTROL') AS controlsDatabase;")).recordset[0];
}
async function main() {
  if (!process.argv.includes('--apply')) throw new Error('Use --apply for the explicitly configured local SQL database.');
  if (provider() !== 'sqlserver' || process.env.NODE_ENV === 'production') throw new Error('Only the local SQL Server development environment is supported.');
  const config = sqlConfig();
  if (!['localhost', '127.0.0.1', '::1', os.hostname().toLowerCase()].includes(config.server.toLowerCase())) throw new Error('Refusing a remote SQL target.');
  let operator, candidate, transaction, committed = false;
  const login = 'miu_web_' + crypto.randomBytes(5).toString('hex');
  const password = 'A1!' + crypto.randomBytes(36).toString('base64url');
  try {
    operator = await new sql.ConnectionPool(config).connect();
    const before = await privileges(operator);
    if (!before.sysadmin && !before.dbOwner && !before.controlsDatabase) { console.log(JSON.stringify({ ok: true, alreadyRestricted: true, privileges: before })); return; }
    if (!before.sysadmin) throw new Error('A SQL administrator must provision the restricted application login.');
    transaction = new sql.Transaction(operator); await transaction.begin();
    await new sql.Request(transaction).input('login', sql.NVarChar(128), login).input('password', sql.NVarChar(200), password).query("DECLARE @statement NVARCHAR(MAX)=N'CREATE LOGIN '+QUOTENAME(@login)+N' WITH PASSWORD='+QUOTENAME(@password,CHAR(39))+N', CHECK_POLICY=ON;'; EXEC(@statement);");
    await new sql.Request(transaction).batch(`CREATE USER ${identifier(login)} FOR LOGIN ${identifier(login)};
IF DATABASE_PRINCIPAL_ID(N'miu_runtime_v1') IS NULL CREATE ROLE [miu_runtime_v1] AUTHORIZATION [dbo];
ALTER ROLE [miu_runtime_v1] ADD MEMBER ${identifier(login)};
${catalog().map(spec => `GRANT ${spec.name === 'AuditLog' ? 'SELECT, INSERT' : 'SELECT, INSERT, UPDATE, DELETE'} ON OBJECT::${spec.table} TO [miu_runtime_v1];`).join('\n')}
GRANT SELECT ON OBJECT::[dbo].[PlatformDatabaseState] TO [miu_runtime_v1];
GRANT SELECT ON OBJECT::[dbo].[PlatformPublicRevision] TO [miu_runtime_v1];`);
    await transaction.commit(); committed = true;
    candidate = await new sql.ConnectionPool({ ...config, user: login, password }).connect();
    const after = await privileges(candidate);
    if (Object.values(after).some(value => value !== 0)) throw new Error('Restricted login unexpectedly has administrative permissions.');
    const readiness = await candidate.request().query("SELECT [version], [validatedAt] FROM [dbo].[PlatformDatabaseState] WHERE [id]=1; SELECT COUNT(*) AS triggersVisible FROM sys.triggers WHERE [name] IN (N'TR_Club_PublicRevision',N'TR_Application_PublicRevision',N'TR_UniversityContent_PublicRevision',N'TR_StudentFeedback_PublicRevision') AND is_disabled=0;");
    if (!readiness.recordsets[0][0]?.validatedAt || readiness.recordsets[1][0]?.triggersVisible !== 4) throw new Error('Restricted login cannot validate application readiness.');
    const audit = (await candidate.request().query("SELECT HAS_PERMS_BY_NAME('dbo.AuditLog','OBJECT','INSERT') AS canAppend, HAS_PERMS_BY_NAME('dbo.AuditLog','OBJECT','UPDATE') AS canEdit, HAS_PERMS_BY_NAME('dbo.AuditLog','OBJECT','DELETE') AS canDelete;")).recordset[0];
    if (audit.canAppend !== 1 || audit.canEdit || audit.canDelete) throw new Error('Audit permissions were not restricted correctly.');
    // Read authorization for every mapped table before changing application configuration.
    await candidate.request().batch(catalog().map(spec => `SELECT TOP (0) [_id] FROM ${spec.table};`).join('\n'));
    const envPath = path.join(root, '.env');
    let text = fs.readFileSync(envPath, 'utf8');
    const parsed = dotenv.parse(text);
    const set = (key, value) => { const line = key + '=' + JSON.stringify(value); const pattern = new RegExp('^' + key + '=.*$', 'm'); text = pattern.test(text) ? text.replace(pattern, () => line) : text.trimEnd() + '\n' + line + '\n'; };
    if (!parsed.SQLSERVER_OPERATIONS_USER && !parsed.SQLSERVER_OPERATIONS_PASSWORD) { set('SQLSERVER_OPERATIONS_USER', config.user); set('SQLSERVER_OPERATIONS_PASSWORD', config.password); }
    else if (!parsed.SQLSERVER_OPERATIONS_USER || !parsed.SQLSERVER_OPERATIONS_PASSWORD) throw new Error('Complete the protected SQL operations credential pair first.');
    set('SQLSERVER_USER', login); set('SQLSERVER_PASSWORD', password);
    const temp = envPath + '.security.tmp'; fs.writeFileSync(temp, text, { mode: 0o600 }); fs.renameSync(temp, envPath);
    console.log(JSON.stringify({ ok: true, runtimeRestricted: true, privileges: after, auditAppendOnly: true, operationsCredentialsPreserved: true }));
  } catch (error) {
    if (!committed && transaction) await transaction.rollback().catch(() => {});
    if (committed && operator) {
      await candidate?.close().catch(() => {}); candidate = null;
      await operator.request().batch(`IF USER_ID(N'${login}') IS NOT NULL DROP USER ${identifier(login)}; IF SUSER_ID(N'${login}') IS NOT NULL DROP LOGIN ${identifier(login)};`).catch(() => {});
    }
    throw error;
  } finally { await candidate?.close(); await operator?.close(); }
}
if (require.main === module) main().catch(error => { console.error('SQL runtime hardening failed:', error.code || error.name); process.exitCode = 1; });
module.exports = { privileges };
