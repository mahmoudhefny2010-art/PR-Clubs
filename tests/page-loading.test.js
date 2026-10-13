const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const http = require('node:http');
const zlib = require('node:zlib');
const express = require('express');
const compression = require('compression');

const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

function loader(fetch) {
  const classes = new Set();
  const timers = new Map();
  const frames = [];
  let nextTimer = 0;
  const classList = { add: (name) => classes.add(name), remove: (name) => classes.delete(name), toggle() {} };
  const document = {
    documentElement: { classList }, readyState: 'complete',
    body: { append() {} }, addEventListener() {},
    createElement: () => ({ classList: { toggle() {}, remove() {} }, setAttribute() {} })
  };
  const window = {
    fetch, history: {}, location: { href: 'https://example.test/', origin: 'https://example.test' },
    setTimeout: (callback) => { timers.set(++nextTimer, callback); return nextTimer; },
    clearTimeout: (id) => timers.delete(id),
    requestAnimationFrame: (callback) => frames.push(callback), cancelAnimationFrame() {}, scrollTo() {}
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../public/assets/js/site-loading.js'), 'utf8'),
    { window, document, Request, URL, Promise });
  return {
    window, pending: () => classes.has('site-startup-pending'),
    async settle() {
      // Flush promise consumers, the quiet timer, then both paint frames.
      for (let i = 0; i < 12; i++) {
        await Promise.resolve();
        const callbacks = [...timers.values()]; timers.clear();
        callbacks.forEach((callback) => callback());
        frames.splice(0).forEach((callback) => callback());
      }
    }
  };
}

test('startup stays covered after headers while JSON is still loading', async () => {
  const body = deferred();
  const app = loader(async () => ({ json: () => body.promise }));
  const response = await app.window.fetch('/api/clubs');
  const consuming = response.json();
  await app.settle();
  assert.equal(app.pending(), true);
  body.resolve([{ id: 1 }]);
  assert.deepEqual(await consuming, [{ id: 1 }]);
  await app.settle();
  assert.equal(app.pending(), false);
});

test('page rendering and chained requests hold startup without an expiry', async () => {
  const render = deferred();
  const app = loader(async () => new Response('{"ok":true}'));
  const ready = app.window.siteStartup.track((async () => {
    await (await app.window.fetch('/api/session')).json();
    await (await app.window.fetch('/api/requests')).json();
    await render.promise;
  })());
  await app.settle();
  assert.equal(app.pending(), true);
  render.resolve();
  await ready;
  await app.settle();
  assert.equal(app.pending(), false);
});

test('failed reads release startup after the page can display its error', async () => {
  const app = loader(async () => new Response('invalid JSON'));
  await assert.rejects((await app.window.fetch('/api/requests')).json());
  await app.settle();
  assert.equal(app.pending(), false);
});

test('notification setup does not hold page data or pass custom options to fetch', async () => {
  const notification = deferred();
  let received;
  const app = loader((input, init) => { received = init; return notification.promise; });
  const pending = app.window.fetch('/api/notifications/config', { siteStartupNonBlocking: true, cache: 'no-store' });
  await app.settle();
  assert.equal(app.pending(), false);
  assert.equal(received.siteStartupNonBlocking, undefined);
  assert.equal(received.cache, 'no-store');
  notification.resolve(new Response('{}'));
  await pending;
});

test('serverless public pages bypass DB wait; data and protected admin routes wait', async () => {
  const ready = deferred();
  const delivered = [];
  const app = (req) => delivered.push(req.url);
  app.ensureReady = () => ready.promise;
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../api/index.js'), 'utf8'), {
    module, URL, require: () => app
  });
  for (const url of ['/pages/feed.html', '/dashboards/dean-dashboard.html', '/assets/css/base.css', '/api/pwa/version']) {
    await module.exports({ url }, {});
    assert.ok(delivered.includes(url));
  }
  const requests = ['/api/clubs', '/api/club-auth/session', '/admin/global', '/admin/club-credentials'];
  const waiting = requests.map((url) => module.exports({ url }, {}));
  assert.ok(requests.every((url) => !delivered.includes(url)));
  ready.resolve();
  await Promise.all(waiting);
  assert.ok(requests.every((url) => delivered.includes(url)));
});

test('compressed public pages and shared assets preserve bytes while reducing transfer', async (t) => {
  const app = express();
  app.use(compression({ threshold: 1024, level: 4 }));
  app.get('/api/fixture', (req, res) => {
    res.setHeader('Cache-Control', 'private, no-store');
    res.json({ records: Array.from({ length: 100 }, (_, id) => ({ id, title: `Example ${id}`, status: 'pending' })) });
  });
  app.use(express.static(path.join(__dirname, '../public')));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const get = (url, encoding) => new Promise((resolve, reject) => {
    http.get({ hostname: '127.0.0.1', port: server.address().port, path: url, headers: { 'Accept-Encoding': encoding } }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve({ body: Buffer.concat(chunks), headers: res.headers, status: res.statusCode }));
      res.on('error', reject);
    }).on('error', reject);
  });
  for (const url of ['/index.html', '/pages/feed.html', '/dashboards/dean-dashboard.html', '/assets/css/base.css', '/assets/js/app-home.js', '/api/fixture']) {
    const plain = await get(url, 'identity');
    const packed = await get(url, 'gzip');
    assert.equal(packed.status, 200);
    assert.equal(packed.headers['content-encoding'], 'gzip');
    assert.deepEqual(zlib.gunzipSync(packed.body), plain.body);
    if (url.startsWith('/api/')) assert.equal(packed.headers['cache-control'], 'private, no-store');
    assert.ok(packed.body.length < plain.body.length * 0.6);
    t.diagnostic(`${url}: ${plain.body.length} -> ${packed.body.length} bytes`);
  }
});
