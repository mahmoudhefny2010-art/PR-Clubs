const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../public/assets/js/admin-dashboard-data.js'), 'utf8');
function harness(fetcher) {
  const streams = [];
  class EventSource {
    constructor() { this.listeners = {}; streams.push(this); }
    addEventListener(name, fn) { this.listeners[name] = fn; }
    close() {}
  }
  const storage = {};
  Object.defineProperties(storage, {
    getItem: { value: key => storage[key] || null }, setItem: { value: (key, value) => { storage[key] = value; } },
    removeItem: { value: key => { delete storage[key]; } }
  });
  const window = { fetch: fetcher, addEventListener() {} };
  vm.runInNewContext(source, { window, document: { visibilityState: 'visible', addEventListener() {} }, navigator: { onLine: true },
    location: { href: 'http://localhost/admin', origin: 'http://localhost' }, URL, Request, Response, btoa, EventSource, sessionStorage: storage });
  return { window, storage, streams };
}
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
const state = { cacheKey: 'fixture', revisions: { homepage: '1', heads: '1', reports: '1', staff: '1' } };
test('parallel private reads are deduplicated; unrelated updates preserve loaded data', async () => {
  const calls = [];
  const h = harness(async input => { calls.push(input); if (input === '/api/admin/dashboard-state') return json(state); return json({ title: 'Welcome' }); });
  await h.window.adminDashboardData.ready;
  await Promise.all([h.window.fetch('/api/admin/homepage'), h.window.fetch('/api/admin/homepage')]);
  assert.equal(calls.filter(url => url === '/api/admin/homepage').length, 1);
  await h.window.fetch('/api/admin/club-heads');
  h.window.adminDashboardData.invalidate(['homepage']);
  await h.window.fetch('/api/admin/club-heads');
  assert.equal(calls.filter(url => url === '/api/admin/club-heads').length, 1);
  await h.window.fetch('/api/admin/homepage');
  assert.equal(calls.filter(url => url === '/api/admin/homepage').length, 2);
});
test('failed deduplicated reads keep their HTTP status and are not cached as success', async () => {
  const h = harness(async url => url === '/api/admin/dashboard-state' ? json(state) : json({ message: 'Unavailable' }, 503));
  await h.window.adminDashboardData.ready;
  const responses = await Promise.all([h.window.fetch('/api/admin/homepage'), h.window.fetch('/api/admin/homepage')]);
  for (const response of responses) { assert.equal(response.status, 503); assert.equal((await response.json()).message, 'Unavailable'); }
});
test('Excel responses bypass JSON caching and keep their bytes', async () => {
  const h = harness(async url => url === '/api/admin/dashboard-state' ? json(state) : new Response(new Uint8Array([80, 75, 3, 4]), { headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' } }));
  await h.window.adminDashboardData.ready;
  const response = await h.window.fetch('/api/report-downloads/attendance.xlsx?clubId=1');
  assert.deepEqual([...new Uint8Array(await response.arrayBuffer())], [80, 75, 3, 4]);
});
test('failed initialization can recover when the connection returns', async () => {
  let offline = true;
  const h = harness(async url => url === '/api/admin/dashboard-state' ? offline ? json({}, 503) : json(state) : json({ title: 'Recovered' }));
  await assert.rejects(h.window.adminDashboardData.ready);
  offline = false;
  const response = await h.window.fetch('/api/admin/homepage');
  assert.equal((await response.json()).title, 'Recovered');
});
test('staff directory data is kept out of persistent tab snapshots', async () => {
  const h = harness(async url => url === '/api/admin/dashboard-state' ? json(state) : json({ accounts: [{ email: 'staff@example.test' }] }));
  await h.window.adminDashboardData.ready;
  await h.window.fetch('/api/admin/staff-accounts');
  assert.equal(JSON.stringify(h.storage).includes('staff@example.test'), false);
});
