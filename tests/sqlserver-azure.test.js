const test = require('node:test');
const assert = require('node:assert/strict');
const { provider, isSqlProvider, sqlPrefix, sqlConfig } = require('../database/config');
const azure = { DATABASE_PROVIDER: 'azuresql', AZURE_SQL_HOST: 'fixture.database.windows.net', AZURE_SQL_DATABASE: 'fixture_db',
  AZURE_SQL_USER: 'fixture_user', AZURE_SQL_PASSWORD: 'fixture_password' };
test('MongoDB, SQL Server and Azure SQL are explicit providers sharing one SQL backend family', () => {
  for (const name of ['mongodb', 'sqlserver', 'azuresql']) assert.equal(provider({ DATABASE_PROVIDER: name }), name);
  assert.equal(isSqlProvider('mongodb'), false); assert.equal(isSqlProvider('sqlserver'), true); assert.equal(isSqlProvider('azuresql'), true);
  assert.equal(sqlPrefix(azure), 'AZURE_SQL'); assert.equal(sqlPrefix({}), 'SQLSERVER');
});
test('Azure SQL login has an isolated configuration profile and verified TLS defaults', () => {
  const config = sqlConfig({ ...azure, SQLSERVER_HOST: 'unrelated', SQLSERVER_USER: 'unrelated', SQLSERVER_PASSWORD: 'unrelated' });
  assert.equal(config.server, azure.AZURE_SQL_HOST); assert.equal(config.database, azure.AZURE_SQL_DATABASE);
  assert.equal(config.user, azure.AZURE_SQL_USER); assert.equal(config.password, azure.AZURE_SQL_PASSWORD);
  assert.equal(config.port, 1433); assert.equal(config.options.encrypt, true); assert.equal(config.options.trustServerCertificate, false);
  assert.equal(config.connectionTimeout, 30000);
});
test('Azure SQL rejects missing Azure credentials instead of taking SQL Server credentials', () => {
  assert.throws(() => sqlConfig({ DATABASE_PROVIDER: 'azuresql', SQLSERVER_HOST: 'local', SQLSERVER_DATABASE: 'local', SQLSERVER_USER: 'local', SQLSERVER_PASSWORD: 'local' }), /AZURE_SQL_HOST/);
  assert.throws(() => sqlConfig({ ...azure, AZURE_SQL_PASSWORD: '' }), /AZURE_SQL_PASSWORD/);
  assert.throws(() => sqlConfig({ ...azure, AZURE_SQL_ENCRYPT: 'false' }), /verified TLS/);
  assert.throws(() => sqlConfig({ ...azure, AZURE_SQL_TRUST_SERVER_CERTIFICATE: 'true' }), /verified TLS/);
});
test('Azure Entra default authentication needs no SQL password and passes the optional managed identity client ID to the driver', () => {
  const config = sqlConfig({ ...azure, AZURE_SQL_AUTH_MODE: 'entra-default', AZURE_SQL_USER: '', AZURE_SQL_PASSWORD: '', AZURE_SQL_CLIENT_ID: 'fixture-client-id' });
  assert.equal(config.user, undefined); assert.equal(config.password, undefined);
  assert.deepEqual(config.authentication, { type: 'azure-active-directory-default', options: { clientId: 'fixture-client-id' } });
  const pool = new (require('mssql').ConnectionPool)(config);
  assert.equal(pool._config().authentication.type, 'azure-active-directory-default');
  assert.equal(pool.connected, false);
});
test('Azure service-principal authentication validates required secret settings and does not forward SQL login credentials', () => {
  const env = { ...azure, AZURE_SQL_AUTH_MODE: 'entra-service-principal', AZURE_SQL_CLIENT_ID: 'fixture-client-id', AZURE_SQL_TENANT_ID: 'fixture-tenant-id', AZURE_SQL_CLIENT_SECRET: 'fixture-client-secret' };
  const config = sqlConfig(env);
  assert.equal(config.user, undefined); assert.equal(config.password, undefined);
  assert.deepEqual(config.authentication, { type: 'azure-active-directory-service-principal-secret', options: { clientId: env.AZURE_SQL_CLIENT_ID, tenantId: env.AZURE_SQL_TENANT_ID, clientSecret: env.AZURE_SQL_CLIENT_SECRET } });
  assert.throws(() => sqlConfig({ ...env, AZURE_SQL_CLIENT_SECRET: '' }), /AZURE_SQL_CLIENT_SECRET/);
});
test('SQL Server supports a named instance without confusing the host, port or Azure profile', () => {
  const config = sqlConfig({ SQLSERVER_HOST: 'localhost', SQLSERVER_DATABASE: 'fixture_db', SQLSERVER_USER: 'fixture_user', SQLSERVER_PASSWORD: 'fixture_password', SQLSERVER_INSTANCE: 'SQLEXPRESS' });
  assert.equal(config.options.instanceName, 'SQLEXPRESS'); assert.equal(config.port, undefined);
  assert.throws(() => sqlConfig({ SQLSERVER_HOST: 'localhost', SQLSERVER_DATABASE: 'fixture_db', SQLSERVER_USER: 'fixture_user', SQLSERVER_PASSWORD: 'fixture_password', SQLSERVER_INSTANCE: 'SQLEXPRESS', SQLSERVER_PORT: '1433' }), /not both/);
  assert.throws(() => sqlConfig({ ...azure, AZURE_SQL_HOST: 'tcp:fixture.database.windows.net,1433' }), /hostname/);
});
test('Azure migration gates require the actual Azure target and cannot be satisfied by an unrelated SQL Server profile', () => {
  const { targetGate } = require('../scripts/sqlserver-migrate.cjs');
  assert.doesNotThrow(() => targetGate({ ...azure, AZURE_SQL_MIGRATION_TARGET_DATABASE: azure.AZURE_SQL_DATABASE }));
  assert.throws(() => targetGate({ ...azure, SQLSERVER_DATABASE: 'local', SQLSERVER_MIGRATION_TARGET_DATABASE: 'local' }), /AZURE_SQL_MIGRATION_TARGET_DATABASE/);
  assert.throws(() => targetGate({ ...azure, AZURE_SQL_MIGRATION_TARGET_DATABASE: 'wrong' }), /AZURE_SQL_MIGRATION_TARGET_DATABASE/);
  assert.throws(() => targetGate({ ...azure, NODE_ENV: 'production', AZURE_SQL_MIGRATION_TARGET_DATABASE: azure.AZURE_SQL_DATABASE }), /isolated migration/);
});
