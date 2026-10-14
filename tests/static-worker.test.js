const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
function worker(fetch, cached) {
  const listeners = {}, matches = [], writes = [];
  const cache = {
    match: async request => { matches.push(request); return cached; },
    put: async (...args) => { writes.push(args); },
    delete: async () => true
  };
  const self = { location: { origin: 'https://example.test' }, addEventListener: (name, callback) => listeners[name] = callback };
  const sandbox = {
    self, caches: { open: async () => cache }, fetch, URL, Response
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../public/sw.js'), 'utf8'), sandbox);
  return {
    matches, writes,
    send(url, options = {}) {
      const background = []; let response;
      listeners.fetch({ request: { url: 'https://example.test' + url, method: 'GET', ...options },
        respondWith: promise => response = promise, waitUntil: promise => background.push(promise) });
      return { get response() { return response; }, background };
    }
  };
}
const assetResponse = value => ({ ok: true, status: 200, type: 'basic', value,
  headers: { get: () => 'no-cache, must-revalidate' }, clone() { return this; } });
test('code assets use latest network response and fall back to cache only when offline', async () => {
  let resolve;
  const network = new Promise(done => resolve = done), cached = assetResponse('cached');
  const app = worker(() => network, cached);
  const event = app.send('/assets/js/site-loading.js?v=new');
  let settled = false;
  event.response.then(() => { settled = true; });
  await Promise.resolve();
  assert.equal(settled, false);
  assert.equal(app.matches.length, 0);
  resolve(assetResponse('updated')); await Promise.all(event.background);
  assert.equal((await event.response).value, 'updated');
  assert.equal(app.writes[0][1].value, 'updated');
});
test('revalidated code assets load the network and refresh their offline copy', async () => {
  const app = worker(async () => assetResponse('new-version'));
  assert.equal((await app.send('/assets/css/base.css?v=new').response).value, 'new-version');
  assert.equal(app.writes.length, 1);
});
test('public HTML uses latest network response while online', async () => {
  let resolve;
  const network = new Promise(done => resolve = done);
  const cached = { ...assetResponse('cached page'), headers: { get: name => name === 'Content-Type' ? 'text/html' : 'public, max-age=0' } };
  const app = worker(() => network, cached);
  const event = app.send('/pages/events.html', { mode: 'navigate' });
  let settled = false;
  event.response.then(() => { settled = true; });
  await Promise.resolve();
  assert.equal(settled, false);
  const latest = { ...assetResponse('updated page'), headers: cached.headers };
  resolve(latest);
  await Promise.all(event.background);
  assert.equal((await event.response).value, 'updated page');
  assert.equal(app.writes[0][1].value, 'updated page');
});
test('private or no-store dashboard HTML is never written to the page cache', async () => {
  const privatePage = { ...assetResponse('private dashboard'), headers: { get: name => name === 'Content-Type' ? 'text/html' : 'private, no-store' } };
  const app = worker(async () => privatePage);
  const response = await app.send('/dashboards/miu-events-dashboard.html', { mode: 'navigate' }).response;
  assert.equal(response, privatePage);
  assert.equal(app.writes.length, 0);
});
test('offline code cache does not affect APIs or protected dashboards', async () => {
  const cached = assetResponse('offline');
  const app = worker(async () => { throw new Error('offline'); }, cached);
  const event = app.send('/assets/js/site-loading.js');
  assert.equal(await event.response, cached);
  for (const url of ['/api/clubs', '/api/report-downloads/attendance.csv', '/dashboards/dean-dashboard.html']) assert.equal(app.send(url).response, undefined);
});
