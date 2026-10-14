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

test('installation warms the main pages and their exact versioned dependencies with bounded concurrency', async () => {
  const listeners = {}, stored = new Map(), fetched = [];
  let active = 0, peak = 0;
  const self = {
    location: { origin: 'https://example.test' },
    addEventListener: (name, callback) => { listeners[name] = callback; },
    skipWaiting: async () => {}
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../public/sw.js'), 'utf8'), {
    self, URL, Response,
    caches: { open: async () => ({ put: async (url, response) => stored.set(url, response) }) },
    fetch: async url => {
      active++; peak = Math.max(peak, active); fetched.push(url);
      await new Promise(done => setImmediate(done));
      active--;
      return { ...assetResponse('shell'), text: async () => '<script src="/assets/js/layout.js?v=test"></script><link href="/assets/css/base.css?v=test"><script src="https://other.test/assets/no.js"></script>' };
    }
  });
  let installed;
  listeners.install({ waitUntil: promise => { installed = promise; } });
  await installed;
  for (const url of ['/', '/index.html', '/pages/feed.html', '/pages/events.html', '/pages/sponsors.html', '/pages/booths.html', '/assets/js/layout.js?v=test', '/assets/css/base.css?v=test']) {
    assert.equal(stored.has(url), true, url);
  }
  assert.equal(fetched.filter(url => url === '/assets/js/layout.js?v=test').length, 1);
  assert.ok(peak <= 3);
  assert.equal(fetched.some(url => url.includes('other.test')), false);
});
test('saved code assets return immediately while the network refreshes their copy', async () => {
  let resolve;
  const network = new Promise(done => resolve = done), cached = assetResponse('cached');
  const app = worker(() => network, cached);
  const event = app.send('/assets/js/site-loading.js?v=new');
  assert.equal(await event.response, cached);
  resolve(assetResponse('updated')); await Promise.all(event.background);
  assert.equal(app.writes[0][1].value, 'updated');
});
test('revalidated code assets load the network and refresh their offline copy', async () => {
  const app = worker(async () => assetResponse('new-version'));
  assert.equal((await app.send('/assets/css/base.css?v=new').response).value, 'new-version');
  assert.equal(app.writes.length, 1);
});
test('main public pages return their saved shell before a slow network finishes', async () => {
  let resolve;
  const network = new Promise(done => resolve = done);
  const cached = { ...assetResponse('cached page'), headers: { get: name => name === 'Content-Type' ? 'text/html' : 'public, max-age=0' } };
  const app = worker(() => network, cached);
  const event = app.send('/pages/events.html', { mode: 'navigate' });
  assert.equal(await event.response, cached);
  const latest = { ...assetResponse('updated page'), headers: cached.headers };
  resolve(latest);
  await Promise.all(event.background);
  assert.equal(app.writes[0][1].value, 'updated page');
});
test('private or no-store dashboard HTML is never written to the page cache', async () => {
  const privatePage = { ...assetResponse('private dashboard'), headers: { get: name => name === 'Content-Type' ? 'text/html' : 'private, no-store' } };
  const app = worker(async () => privatePage);
  const response = app.send('/dashboards/miu-events-dashboard.html', { mode: 'navigate' }).response;
  assert.equal(response, undefined);
  assert.equal(app.writes.length, 0);
});

test('explicit reload waits for the latest public shell', async () => {
  let resolve;
  const network = new Promise(done => resolve = done);
  const app = worker(() => network, assetResponse('old'));
  const event = app.send('/pages/feed.html', { mode: 'navigate', cache: 'reload' });
  let settled = false;
  event.response.then(() => { settled = true; });
  await new Promise(done => setImmediate(done));
  assert.equal(settled, false);
  resolve(assetResponse('latest'));
  assert.equal((await event.response).value, 'latest');
});

test('forms, account URLs and public pages with query parameters bypass saved HTML', () => {
  const app = worker(async () => assetResponse('network'), assetResponse('cached'));
  for (const url of ['/pages/applicant-login.html', '/pages/event-form.html', '/?myForms=1', '/?apply=2', '/pages/feed.html?preview=1']) {
    assert.equal(app.send(url, { mode: 'navigate' }).response, undefined);
  }
  assert.equal(app.matches.length, 0);
});
test('offline code cache does not affect APIs or protected dashboards', async () => {
  const cached = assetResponse('offline');
  const app = worker(async () => { throw new Error('offline'); }, cached);
  const event = app.send('/assets/js/site-loading.js');
  assert.equal(await event.response, cached);
  for (const url of ['/api/clubs', '/api/report-downloads/attendance.csv', '/dashboards/dean-dashboard.html']) assert.equal(app.send(url).response, undefined);
});
