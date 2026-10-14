const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { registerPublicDataStream } = require('../services/public-data-stream');

function browser(storage = new Map(), fetcher = async () => new Response('[]')) {
  const timers = new Map(), events = {}, documentEvents = {}, sources = [];
  let id = 0;
  const listen = target => (key, fn) => { (target[key] ||= []).push(fn); };
  class EventSource {
    constructor(url) { this.url = url; this.events = {}; this.addEventListener = listen(this.events); sources.push(this); }
    close() { this.closed = true; }
    send(type, keys = [], token = 'resume-token') {
      for (const fn of this.events[type] || []) fn({ data: JSON.stringify({ keys }), lastEventId: token });
    }
  }
  const location = { href: 'https://example.test/pages/feed.html', origin: 'https://example.test' };
  const document = { visibilityState: 'visible', addEventListener: listen(documentEvents) };
  const navigator = { onLine: true };
  const window = { fetch: fetcher, addEventListener: listen(events) };
  vm.runInNewContext(fs.readFileSync('public/assets/js/public-live-data.js', 'utf8'), {
    window, document, navigator, location, Request, Response, URL, EventSource,
    localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) },
    setTimeout: fn => { timers.set(++id, fn); return id; }, clearTimeout: key => timers.delete(key)
  });
  return {
    window, sources, storage, document, navigator,
    emit: (type, event = {}) => (events[type] || []).forEach(fn => fn(event)),
    visibility(value) { document.visibilityState = value; (documentEvents.visibilitychange || []).forEach(fn => fn()); },
    async flush() {
      for (let turn = 0; turn < 20; turn++) {
        const tasks = [...timers.values()]; timers.clear(); tasks.forEach(fn => fn());
        await new Promise(resolve => setImmediate(resolve));
      }
    },
    timers
  };
}
const seed = () => new Map([
  ['miu-public-clubs-v1', JSON.stringify({ data: [{ id: 1, name: 'Saved' }] })],
  ['miu-public-university-content-v1', JSON.stringify({ data: [{ id: 2 }] })],
  ['miu:public-live-token', 'old-token']
]);

test('cached public data survives navigation and reopening without another download', async () => {
  let downloads = 0;
  const storage = seed();
  for (let visit = 0; visit < 2; visit++) {
    const app = browser(storage, async () => { downloads++; return new Response('[]'); });
    assert.equal((await (await app.window.fetch('/api/clubs?media=links')).json())[0].name, 'Saved');
    app.sources[0].send('ready');
    await app.flush();
    assert.equal(app.timers.size, 0, 'There is no periodic refresh timer');
  }
  assert.equal(downloads, 0);
});

test('a change downloads only the affected dataset and coalesces simultaneous reads', async () => {
  const downloads = [];
  const app = browser(seed(), async url => { downloads.push(url); return new Response('[{"id":1,"name":"Updated"}]'); });
  app.window.miuLiveData.watch(async () => {
    await Promise.all([
      app.window.fetch('/api/clubs?media=links'),
      app.window.fetch('/api/clubs?media=links'),
      app.window.fetch('/api/university-content')
    ]);
  });
  app.sources[0].send('invalidate', ['clubs']);
  await app.flush();
  assert.deepEqual(downloads, ['/api/clubs?media=links']);
  assert.equal((await (await app.window.fetch('/api/clubs?media=links')).json())[0].name, 'Updated');
  assert.equal(app.storage.get('miu:public-live-token'), 'resume-token');
});

test('private APIs always use the network and failed refreshes remain dirty for reconnection', async () => {
  const downloads = [];
  const app = browser(seed(), async url => { downloads.push(url); return new Response('[]', { status: 503 }); });
  await app.window.fetch('/api/student/my-forms');
  await app.window.fetch('/api/clubs?media=links', { method: 'POST' });
  app.window.miuLiveData.watch(() => app.window.fetch('/api/clubs?media=links'));
  app.sources[0].send('invalidate', ['clubs']);
  await app.flush();
  assert.ok(app.storage.get('miu:public-dirty:clubs'));
  app.visibility('hidden');
  assert.equal(app.sources[0].closed, true);
  app.visibility('visible');
  await app.flush();
  assert.equal(app.sources.length, 2);
  assert.ok(app.sources[1].url.includes('since=resume-token'));
  assert.equal(downloads.filter(url => url === '/api/clubs?media=links').length, 3);
});

async function streamRequest({ token, changes = [], ready = true, sql = false, expired = false } = {}) {
  let handler, closed = 0;
  const opens = [], output = [], headers = {};
  const database = { isSqlProvider: sql, connection: { db: { watch(pipeline, options) {
    opens.push({ pipeline, options });
    let index = 0;
    return {
      resumeToken: { _data: 'ABCD' }, close: async () => { closed++; },
      tryNext: async () => {
        if (expired && opens.length === 1) throw Object.assign(new Error('expired'), { code: 286 });
        if (index < changes.length) return changes[index++];
        throw new Error('test disconnect');
      }
    };
  } } } };
  registerPublicDataStream({ get: (path, fn) => { handler = fn; } }, {
    database, ready: () => ready, collections: { clubs: ['clubs'], universitycontents: ['universityContent'] }
  });
  const res = {
    code: 200, status(code) { this.code = code; return this; }, json() {}, on() {},
    setHeader(key, value) { headers[key] = value; }, flushHeaders() {},
    write(value) { output.push(value); }, end() {}
  };
  await handler({ get: () => token, query: {} }, res);
  return { opens, output: output.join(''), closed, res, headers };
}

test('server resumes change streams and sends dataset names without private documents', async () => {
  const token = Buffer.from(JSON.stringify({ _data: '1234' })).toString('base64url');
  const app = await streamRequest({ token, changes: [null, { _id: { _data: 'ABCD' }, ns: { coll: 'clubs' }, fullDocument: { private: 'secret' } }] });
  assert.deepEqual(app.opens[0].options.resumeAfter, { _data: '1234' });
  assert.match(app.output, /event: ready/);
  assert.match(app.output, /"keys":\["clubs"\]/);
  assert.doesNotMatch(app.output, /secret|private/);
  assert.equal(app.closed, 1);
  assert.equal(app.headers['Content-Type'], 'text/event-stream');
});

test('expired resume tokens reset both public snapshots once and reopen the stream', async () => {
  const token = Buffer.from(JSON.stringify({ _data: '1234' })).toString('base64url');
  const app = await streamRequest({ token, expired: true, changes: [null] });
  assert.equal(app.opens.length, 2);
  assert.equal(app.opens[1].options.resumeAfter, undefined);
  assert.match(app.output, /"keys":\["clubs","universityContent"\]/);
  assert.equal(app.closed, 2);
});

test('unavailable Mongo and SQL notification backends reject stream requests', async () => {
  for (const options of [{ ready: false }, { sql: true }]) {
    const app = await streamRequest(options);
    assert.equal(app.res.code, 503);
    assert.equal(app.opens.length, 0);
  }
});
