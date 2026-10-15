const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const { readAdminSessionData } = require('../services/admin-session-read');

test('successful session reads run once without reconnecting', async () => {
  let reads = 0;
  const result = await readAdminSessionData(async () => { reads++; return { sessionVersion: 2 }; }, { isSqlProvider: true, connect() { throw new Error('Unexpected reconnect'); } });
  assert.equal(reads, 1); assert.equal(result.sessionVersion, 2);
});
test('transient SQL failures reconnect and read the current revocation state', async () => {
  for (const code of ['DATABASE_UNAVAILABLE', 'ESOCKET', 'ECONNCLOSED', 'ENOCONN', 'ETIMEOUT']) {
    let reads = 0, connections = 0;
    const value = await readAdminSessionData(async () => {
      if (++reads === 1) throw Object.assign(new Error('Fixture connection failure'), { code });
      return { sessionVersion: 3 };
    }, { isSqlProvider: true, connect: async () => { connections++; } });
    assert.equal(value.sessionVersion, 3); assert.equal(reads, 2); assert.equal(connections, 1);
  }
});
test('persistent SQL errors fail closed after one retry', async () => {
  let reads = 0;
  await assert.rejects(readAdminSessionData(async () => { reads++; throw Object.assign(new Error('offline'), { code: 'ESOCKET' }); }, { isSqlProvider: true, connect: async () => {} }), /offline/);
  assert.equal(reads, 2);
});
test('configuration errors and MongoDB errors are not retried', async () => {
  for (const [isSqlProvider, code] of [[true, 'ELOGIN'], [true, 'EREQUEST'], [false, 'ETIMEOUT']]) {
    let reads = 0;
    await assert.rejects(readAdminSessionData(async () => { reads++; throw Object.assign(new Error('failure'), { code }); }, { isSqlProvider, connect() { throw new Error('Unexpected reconnect'); } }), /failure/);
    assert.equal(reads, 1);
  }
});
test('failed session validation keeps preview protected and serves HTML while APIs retain JSON', async () => {
  const source = fs.readFileSync(require.resolve('../server'), 'utf8');
  const start = source.indexOf('async function requireAdmin(');
  const guardSource = source.slice(start, source.indexOf('async function requireMiuEventsDashboard(', start));
  const guard = vm.runInNewContext(`${guardSource}; requireAdmin`, {
    isSoftwareDevelopmentSession: async () => { throw Object.assign(new Error('offline'), { code: 'ESOCKET' }); },
    console: { error() {} }, sendHttpErrorPage: (res, status, title, detail) => { res.statusCode = status; res.html = { title, detail }; }
  });
  for (const path of ['/admin', '/api/admin/homepage']) {
    const res = { set() { return this; }, status(code) { this.statusCode = code; return this; }, json(data) { this.data = data; } };
    let allowed = false;
    await guard({ method: 'GET', path }, res, () => { allowed = true; });
    assert.equal(allowed, false); assert.equal(res.statusCode, 503);
    assert.equal(Boolean(res.html), path === '/admin');
    assert.equal(Boolean(res.data), path.startsWith('/api/'));
  }
});
