function sqlConnectionDiagnostic(error) {
  const message = String(error?.message || '');
  if (message.includes('must be a hostname or IP')) return 'Use a hostname in SQLSERVER_HOST/AZURE_SQL_HOST; configure a named instance or port separately.';
  if (message === 'Configure SQLSERVER_PORT or SQLSERVER_INSTANCE, not both.') return message;
  const field = message.match(/^((?:SQLSERVER|AZURE_SQL)_[A-Z_]+) must /)?.[1];
  if (field) return `${field} is missing or invalid. Check its value in the private environment configuration.`;
  if (message === 'SQL database has not passed migration validation. Run the documented staging migration first.') return message;
  if (message === 'SQL public notifications are not installed. Apply the public notification migration.') return message;
  if (message === 'Production SQL cutover has not been approved.') return message;
  if (message === 'SQL Server database compatibility level must be at least 130.') return message;
  const code = error?.code || error?.originalError?.code;
  const number = error?.number || error?.originalError?.info?.number;
  if (code === 'ELOGIN') return 'SQL authentication failed. Check the configured login, authentication mode and database access.';
  if (code === 'EINSTLOOKUP') return 'The named SQL instance could not be resolved. Check SQL Server Browser and UDP 1434, or use the instance TCP port instead.';
  if (['ESOCKET', 'ETIMEOUT', 'ECONNREFUSED', 'ENOTFOUND', 'EHOSTUNREACH'].includes(code)) return 'The SQL server could not be reached. Check that SQL Server is running, TCP/IP is enabled, and the host, port and firewall are correct.';
  if ([208, 207].includes(number)) return 'The SQL database schema is missing or outdated. Apply and validate the documented migrations on the intended target.';
  if (number === 4060) return 'The configured SQL database cannot be opened by this login.';
  return 'SQL initialization failed. Check the private database configuration and validated migration state.';
}
module.exports = { sqlConnectionDiagnostic };
