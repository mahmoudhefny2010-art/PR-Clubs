function boolean(env, key, fallback) {
  if (env[key] === undefined || env[key] === '') return fallback;
  if (!['true', 'false'].includes(env[key])) throw new Error(`${key} must be true or false.`);
  return env[key] === 'true';
}
function integer(env, key, fallback, max) {
  const result = Number(env[key] || fallback);
  if (!Number.isInteger(result) || result < 1 || result > max) throw new Error(`${key} is out of range.`);
  return result;
}
function provider(env = process.env) {
  const name = env.DATABASE_PROVIDER || 'mongodb';
  if (!['mongodb', 'sqlserver', 'azuresql'].includes(name)) throw new Error('DATABASE_PROVIDER must be mongodb, sqlserver or azuresql.');
  return name;
}
function sqlConfig(env = process.env) {
  const prefix = sqlPrefix(env), azure = prefix === 'AZURE_SQL';
  const required = suffix => {
    const key = `${prefix}_${suffix}`;
    if (!env[key] || /YOUR_|REPLACE_|CHANGE_ME/i.test(env[key])) throw new Error(`${key} must be configured in the protected environment.`);
    return env[key];
  };
  const server = required('HOST'), database = required('DATABASE');
  if (!require('node:net').isIP(server) && /[/\\,:\s]/.test(server)) throw new Error(`${prefix}_HOST must be a hostname or IP; set port/instance separately.`);
  const mode = env[`${prefix}_AUTH_MODE`] || 'sql';
  let authentication;
  if (mode === 'sql') authentication = { user: required('USER'), password: required('PASSWORD') };
  else if (azure && mode === 'entra-default') authentication = { authentication: { type: 'azure-active-directory-default', options: {
    ...(env.AZURE_SQL_CLIENT_ID ? { clientId: required('CLIENT_ID') } : {})
  } } };
  else if (azure && mode === 'entra-service-principal') authentication = { authentication: { type: 'azure-active-directory-service-principal-secret', options: {
    clientId: required('CLIENT_ID'), tenantId: required('TENANT_ID'), clientSecret: required('CLIENT_SECRET')
  } } };
  else throw new Error('Use SQL authentication, or for Azure SQL use entra-default or entra-service-principal.');
  const encrypt = boolean(env, `${prefix}_ENCRYPT`, true);
  const trustServerCertificate = boolean(env, `${prefix}_TRUST_SERVER_CERTIFICATE`, false);
  if (azure && (!encrypt || trustServerCertificate)) throw new Error('Azure SQL connections require verified TLS.');
  if (env.NODE_ENV === 'production' && (!encrypt || trustServerCertificate)) throw new Error('Production SQL connections require verified TLS.');
  const instanceName = !azure && env.SQLSERVER_INSTANCE ? required('INSTANCE') : undefined;
  if (instanceName && env.SQLSERVER_PORT) throw new Error('Configure SQLSERVER_PORT or SQLSERVER_INSTANCE, not both.');
  return {
    server, ...(instanceName ? {} : { port: integer(env, `${prefix}_PORT`, 1433, 65535) }), database, ...authentication,
    connectionTimeout: integer(env, `${prefix}_CONNECTION_TIMEOUT_MS`, azure ? 30000 : 8000, 60000),
    requestTimeout: integer(env, `${prefix}_REQUEST_TIMEOUT_MS`, 15000, 120000),
    pool: { max: integer(env, `${prefix}_POOL_MAX`, 5, 50), min: 0, idleTimeoutMillis: 45000 },
    options: { encrypt, trustServerCertificate, useUTC: true, abortTransactionOnError: true, ...(instanceName ? { instanceName } : {}) }
  };
}
function isSqlProvider(name) { return name === 'sqlserver' || name === 'azuresql'; }
function sqlPrefix(env = process.env) { return provider(env) === 'azuresql' ? 'AZURE_SQL' : 'SQLSERVER'; }
module.exports = { provider, sqlConfig, isSqlProvider, sqlPrefix };
