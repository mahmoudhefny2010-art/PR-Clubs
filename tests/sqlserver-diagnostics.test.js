const test = require('node:test');
const assert = require('node:assert/strict');
const { sqlConnectionDiagnostic } = require('../database/diagnostics');

test('SQL startup diagnostics explain configuration and connection failures without disclosing credentials', () => {
  assert.match(sqlConnectionDiagnostic(new Error('SQLSERVER_HOST must be a hostname or IP; set port/instance separately.')), /configure a named instance/);
  assert.match(sqlConnectionDiagnostic(new Error('SQLSERVER_PASSWORD must be configured in the protected environment.')), /SQLSERVER_PASSWORD is missing or invalid/);
  assert.match(sqlConnectionDiagnostic({ code: 'EINSTLOOKUP' }), /SQL Server Browser/);
  assert.match(sqlConnectionDiagnostic({ code: 'ELOGIN', message: 'secret-login secret-password' }), /authentication failed/);
  assert.match(sqlConnectionDiagnostic({ code: 'ESOCKET', message: 'secret-host' }), /TCP\/IP/);
  assert.match(sqlConnectionDiagnostic({ number: 208 }), /schema is missing/);
  for (const error of [{ message: 'secret-login secret-password' }, { message: 'SQLSERVER_HOST must secret-host' }, { code: 'ELOGIN', message: 'secret-password' }]) {
    assert.doesNotMatch(sqlConnectionDiagnostic(error), /secret-/);
  }
});
