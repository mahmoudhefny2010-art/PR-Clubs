const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { toolIds, renderDashboardPage } = require('../services/admin-dashboard-pages');
const { createRevisionReader, revisionsFromModels, changedTools } = require('../services/admin-dashboard-live');
const root = path.resolve(__dirname, '..');
test('all tools have an administration navbar, shared footer and local dependencies without legacy dashboard links or dialogs', () => {
  for (const tool of ['', ...toolIds]) {
    const html = renderDashboardPage(root, tool);
    assert.match(html, /id="adminWorkspaceHeader"/); assert.match(html, /id="site-footer"/);
    assert.doesNotMatch(html, /class="v2-brand"/); assert.match(html, /v2-sidebar-account/);
    assert.match(html, /site-loading\.js/); assert.match(html, /pwa-register\.js/);
    assert.ok(html.includes(`data-tool="${tool}"`));
    assert.doesNotMatch(html, /<dialog\b|href="\/admin\/global"/);
    for (const match of html.matchAll(/(?:src|href)="(\/assets\/[^"?]+)[^"\s]*"/g)) assert.ok(fs.existsSync(path.join(root, 'public', match[1])), match[1]);
  }
});
test('revisions invalidate only tools affected by their data, including deletions', () => {
  const before = revisionsFromModels({ Club: 'a', Application: 'b', ClubAccount: 'c', SiteSetting: 'd' });
  assert.deepEqual(changedTools(before, before), []);
  const homepage = revisionsFromModels({ Club: 'a', Application: 'b', ClubAccount: 'c', SiteSetting: 'e' });
  assert.ok(changedTools(before, homepage).includes('homepage')); assert.ok(changedTools(before, homepage).includes('data'));
  assert.ok(!changedTools(before, homepage).includes('applications'));
  const deleted = revisionsFromModels({ Club: 'empty', Application: 'b', ClubAccount: 'c', SiteSetting: 'd' });
  assert.ok(changedTools(before, deleted).includes('clubs'));
  assert.ok(changedTools(before, deleted).includes('members'));
  assert.ok(!changedTools(before, deleted).includes('homepage'));
});
test('SQL revision reads use only ID/version metadata and coalesce concurrent viewers', async () => {
  let queries = 0;
  const runtime = { request: () => ({ query: async query => {
    queries++; assert.doesNotMatch(query, /_payload|INSERT|UPDATE|DELETE|CREATE/);
    assert.match(query, /HASHBYTES/); assert.match(query, /_version/);
    return { recordset: [{ model: 'Club', revision: 'abc' }] };
  } }) };
  const read = createRevisionReader({ database: { isSqlProvider: true }, models: [{ name: 'Club', table: '[dbo].[Club]' }], runtime });
  const result = await Promise.all([read(), read(), read()]);
  assert.equal(queries, 1); assert.equal(Object.keys(result[0]).length, toolIds.length);
  assert.deepEqual(result[0], result[1]); await read(); assert.equal(queries, 1);
});
test('Mongo revision reads project only identity and update timestamps', async () => {
  let reads = 0;
  const read = createRevisionReader({ database: { isSqlProvider: false }, models: [{ name: 'Club', model: {
    find() { reads++; return { select(fields) { assert.equal(fields, '_id updatedAt'); return { lean: async () => [{ _id: 'abc', updatedAt: new Date('2026-10-15') }] }; } }; }
  } }] });
  const result = await read(); await read(); assert.equal(reads, 1); assert.equal(Object.keys(result).length, toolIds.length);
});
