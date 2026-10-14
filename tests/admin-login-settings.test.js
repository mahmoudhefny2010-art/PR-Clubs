const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../server'), 'utf8');
test('login settings expose current configured identity and respect local/environment policy', () => {
  const route = source.match(/app\.get\('\/api\/admin\/login-settings',[\s\S]*?\n\}\);/)[0];
  assert.ok(source.indexOf("app.use('/api/admin', requireAdmin)") < source.indexOf(route));
  for (const [local, environment, editable] of [[true, false, true], [false, false, false], [true, true, false], [false, true, false]]) {
    let handler, result;
    vm.runInNewContext(route, { app: { get: (url, callback) => handler = callback },
      getConfiguredAdminEmail: () => 'actual-admin@example.edu', isLoopbackRequest: () => local,
      process: { env: environment ? { ADMIN_EMAIL: 'actual-admin@example.edu', ADMIN_PASSWORD: 'test' } : {} } });
    handler({}, { json: value => result = value });
    assert.equal(result.email, 'actual-admin@example.edu'); assert.equal(result.editable, editable);
    assert.equal(result.environmentManaged, environment);
  }
});
