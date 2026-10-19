const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const express = require('express');
const P = require('../services/public-content-pagination');

class Element {
  constructor() { this.children = []; this.attributes = {}; this.dataset = {}; this.listeners = {}; }
  setAttribute(k, v) { this.attributes[k] = String(v); }
  append(el) { this.children.push(el); }
  replaceChildren() { this.children = []; }
  after(el) { this.nav = el; }
  addEventListener(name, fn) { this.listeners[name] = fn; }
  querySelector() { return this.children.find(el => el.attributes['aria-current']); }
  scrollIntoView() { this.scrolled = true; }
  focus() { this.focused = true; }
}
function browser(fetcher, search = '') {
  const calls = [], renders = [], errors = [], list = new Element();
  const location = { href: `https://example.test/pages/feed.html${search}`, search };
  const window = { matchMedia: () => ({ matches: false, addEventListener() {} }) };
  const context = { window, URLSearchParams, URL, AbortController, location,
    history: { replaceState(_a, _b, url) { location.href = String(url); location.search = new URL(url).search; } },
    document: { createElement: () => new Element() }, fetch: async (url, init) => {
      calls.push(url); const result = await fetcher(new URL(url, location.href), init);
      return { ok: true, json: async () => result };
    } };
  vm.runInNewContext(fs.readFileSync(require.resolve('../public/assets/js/content-pagination.js'), 'utf8'), context);
  const make = (section = 'feed', target = list) => window.MiuPagination.create({ section, list: target,
    render: (items, meta) => renders.push({ items, meta }), onError: error => errors.push(error) });
  return { list, make, calls, renders, errors, window, location };
}
function data(total, requested = 1, size = 10) {
  const pagination = P.metadata(total, requested, size);
  return { pagination, items: Array.from({ length: Math.min(size, total - (pagination.page - 1) * size) }, (_, i) => ({ id: (pagination.page - 1) * size + i + 1 })) };
}

test('real counts drive empty, exact, partial and arbitrarily large page totals', () => {
  for (const [total, pages] of [[0, 0], [7, 1], [10, 1], [11, 2], [25, 3], [100, 10], [10001, 1001]]) {
    const meta = P.metadata(total, 99999, 10);
    assert.equal(meta.totalPages, pages); assert.equal(meta.page, pages || 1);
  }
  assert.equal(P.options('invalid'), null);
  const opts = P.options('feed', { page: '-1', pageSize: '99999', filter: 'invalid', clubId: 'bad', post: 'no' });
  assert.equal(opts.page, 1); assert.equal(opts.pageSize, 50); assert.equal(opts.filter, 'all'); assert.equal(opts.clubId, 0);
  assert.equal(P.options('events').pageSize, 8);
  assert.equal(P.options('feed', { post: '1790000000000', clubId: '1790000000001' }).post, 1790000000000);
  assert.equal(P.options('feed', { post: '1790000000000', clubId: '1790000000001' }).clubId, 1790000000001);
});
test('event pages rank newest publications before paging, with deterministic ties', () => {
  const opts = P.options('events', { page: 2 });
  const pipeline = P.mongoPipeline({ collection: { name: 'clubs' } }, { collection: { name: 'universitycontent' } }, opts);
  const ranking = pipeline.find(stage => stage.$setWindowFields).$setWindowFields;
  assert.deepEqual(ranking.sortBy, { published: -1, university: 1, clubId: 1, collection: 1, index: 1 });
  assert.equal(pipeline.at(-1).$facet.items[0].$skip, 8);
  const sql = require('../database/public-content-pagination').pageQuery(opts);
  assert.match(sql, /ROW_NUMBER\(\) OVER \(ORDER BY published DESC, university, clubId, collection, \[index\]\)/);
  assert.match(sql, /WHERE position>\(CAST\(@current AS BIGINT\)-1\)\*@pageSize/);
});
test('public output strips private fields and preserves original indexes for media links', () => {
  const row = P.serialize({ clubId: 4, clubName: 'Club', collection: 'sponsors', index: 21, updatedAt: '2026-10-19',
    item: { title: 'Sponsor', sponsorLogo: 'data:image/png;base64,YQ==', staffEmail: 'secret', privateBudget: 10 } });
  assert.match(row.item.sponsorLogo, /\/4\/sponsors\/21\/sponsorLogo\?v=/);
  assert.equal(row.item.staffEmail, undefined);
  assert.equal(row.item.privateBudget, undefined);
  const uni = P.serialize({ university: true, clubId: 0, collection: 'events', index: 99,
    item: { id: 99, type: 'event', registrationEnabled: false, attendanceEnabled: true, publishedBy: 'private' } });
  assert.equal(uni.club.name, 'Misr International University');
  assert.equal(uni.item.attendanceEnabled, false); assert.equal(uni.item.publishedBy, undefined);
});
test('SQL Extended JSON dates decode exactly like database model reads', () => {
  const createdAt = new Date('2026-10-19T09:00:00Z');
  const item = require('mongoose').mongo.BSON.EJSON.stringify({ id: 17, type: 'event', title: 'University event', createdAt, updatedAt: createdAt });
  const row = P.serialize({ clubId: 0, collection: 'events', index: 17, university: true, item });
  assert.ok(row.item.createdAt instanceof Date);
  assert.equal(row.item.createdAt.toISOString(), createdAt.toISOString());
  assert.equal(JSON.parse(JSON.stringify(row.item)).createdAt, createdAt.toISOString());
});
test('number controls scale with actual totals and collapse around distant pages', () => {
  const f = browser(() => data(0));
  const nums = f.window.MiuPagination.numbers;
  assert.deepEqual(Array.from(nums(1, 3)), [1, 2, 3]);
  for (const compact of [false, true]) {
    const result = Array.from(nums(500, 10000, compact));
    assert.equal(result[0], 1); assert.equal(result.at(-1), 10000); assert.ok(result.includes(500)); assert.ok(result.includes('…'));
    assert.ok(result.length <= 7);
  }
});
test('next, previous and direct pages load only requested records and update URL/active state', async () => {
  const f = browser(url => data(25, Number(url.searchParams.get('page')))); const pager = f.make();
  await pager.load();
  assert.equal(f.list.nav.children[0].disabled, true);
  await pager.load(2, true);
  assert.equal(f.renders.at(-1).items[0].id, 11);
  assert.equal(f.list.nav.querySelector().textContent, 2);
  assert.ok(f.location.search.includes('feedPage=2')); assert.equal(f.list.scrolled, true);
  await pager.load(3);
  assert.equal(f.renders.at(-1).items.length, 5); assert.equal(f.list.nav.children.at(-1).disabled, true);
  await pager.load(1); assert.equal(f.renders.at(-1).items[0].id, 1);
});
test('growth, deletion and filter resets refresh page metadata; empty and single pages hide navigation', async () => {
  let total = 11;
  const f = browser(url => data(total, Number(url.searchParams.get('page')))); const pager = f.make();
  await pager.load(2); assert.equal(f.list.nav.hidden, false);
  total = 25; await pager.load(); assert.equal(f.renders.at(-1).meta.totalPages, 3);
  total = 7; await pager.load(); assert.equal(f.renders.at(-1).meta.page, 1); assert.equal(f.list.nav.hidden, true);
  total = 0; await pager.setFilter('announcements'); assert.equal(f.renders.at(-1).items.length, 0);
  assert.equal(new URL(f.calls.at(-1), 'https://x').searchParams.get('page'), '1');
  assert.equal(f.list.nav.hidden, true);
});
test('independent sections preserve state and repeated identical refreshes do not rerender', async () => {
  const f = browser(url => data(100, Number(url.searchParams.get('page'))));
  const feed = f.make(), sponsors = f.make('sponsors', new Element());
  await feed.load(3); await sponsors.load(2); await feed.load();
  assert.equal(f.renders.length, 2);
  assert.match(f.calls.at(-1), /feed\?page=3/);
  assert.ok(f.location.search.includes('feedPage=3')); assert.ok(f.location.search.includes('sponsorsPage=2'));
});
test('inflight duplicates share one call; late responses cannot replace newer filters', async () => {
  const resolves = [];
  const f = browser(() => new Promise(resolve => resolves.push(resolve))); const pager = f.make();
  const one = pager.load(), duplicate = pager.load();
  assert.equal(f.calls.length, 1);
  const two = pager.setFilter('events');
  resolves[1](data(3)); await two; resolves[0](data(100)); await Promise.all([one, duplicate]);
  assert.equal(f.renders.length, 1); assert.equal(f.renders[0].meta.totalItems, 3);
});
test('HTTP route validates section, normalizes parameters and returns uncached metadata', async t => {
  const app = express(); let captured;
  P.registerPublicContentPagination(app, { ensureReady: async () => {}, requireLiveDatabase: () => true,
    readPage: async opts => { captured = opts; return data(25, opts.page, opts.pageSize); } });
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const response = await fetch(`${base}/api/public-content/feed?page=3&pageSize=10&filter=events&q=club`);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const result = await response.json(); assert.equal(result.pagination.totalPages, 3); assert.equal(result.items.length, 5);
  assert.equal(captured.filter, 'events'); assert.equal(captured.q, 'club');
  assert.equal((await fetch(`${base}/api/public-content/unknown`)).status, 404);
});
