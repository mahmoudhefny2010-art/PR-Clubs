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
test('all-activity and developer-activity logs are separate first-class dashboard tools', () => {
  for (const id of ['all-activity-log', 'developer-activity-log']) {
    assert.ok(toolIds.includes(id));
    assert.match(renderDashboardPage(root, id), new RegExp(`data-tool="${id}"`));
  }
  const tools = fs.readFileSync(path.join(root, 'public/assets/js/admin-dashboard-tools.js'), 'utf8');
  const dashboard = fs.readFileSync(path.join(root, 'public/assets/js/pages/admin-dashboard-v2.js'), 'utf8');
  assert.match(tools, /\['all-activity-log', 'All Activity Log'/);
  assert.match(tools, /\['developer-activity-log', 'Developer Activity Log'/);
  assert.match(dashboard, /all-activity-log' \|\| id === 'developer-activity-log'/);
  assert.match(dashboard, /read\(developerOnly \? '\/api\/admin\/security\/audit\?actorRole=software_development' : '\/api\/admin\/security\/audit'\)/);
  assert.match(dashboard, /escape\(entry\.actorEmail/);
  assert.match(dashboard, /All available recorded changes are shown/);
  assert.match(dashboard, /data-activity-toggle/);
  assert.match(dashboard, /What was changed:/);
  assert.match(dashboard, /switch-dashboard/);
  assert.match(dashboard, /actorRole \|\| ''\)\.toLowerCase\(\) === 'software_development'/);
  assert.match(dashboard, /Edited club information/);
  assert.doesNotMatch(dashboard, /<strong>Request:<\/strong> \$\{escape\(entry\.action/);
  assert.match(renderDashboardPage(root), /20261017clubimport1/);
});
test('Excel club import is an admin-only, full-workbook review with an explicit confirmation step', () => {
  assert.ok(toolIds.includes('excel-review'));
  const tools = fs.readFileSync(path.join(root, 'public/assets/js/admin-dashboard-tools.js'), 'utf8');
  const dashboard = fs.readFileSync(path.join(root, 'public/assets/js/pages/admin-dashboard-v2.js'), 'utf8');
  const importer = fs.readFileSync(path.join(root, 'public/assets/js/pages/admin-excel-import.js'), 'utf8');
  const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
  assert.match(tools, /\['excel-review', 'Import clubs from Excel'/);
  assert.match(dashboard, /mountAdminExcelImport/);
  assert.match(importer, /workbook\.xlsx\.load\(await file\.arrayBuffer\(\)\)/);
  assert.match(importer, /rows\.length\s*>\s*2000/);
  assert.match(importer, /all .* rows checked locally/i);
  assert.match(importer, /uploadImageToCloudinary\(item\.imageFile,'club'\)/);
  assert.match(importer, /Review and import clubs/);
  assert.match(importer, /Undo latest import/);
  assert.match(importer, /\/api\/admin\/clubs\/import\/undo/);
  assert.match(importer, /\['miu theatre','theater'\]/);
  assert.match(importer, /\['tuners','tunners'\]/);
  assert.match(importer, /\['ieee miu sb','ieee'\]/);
  assert.match(importer, /\['miu-munal','mun'\]/);
  assert.match(importer, /use workbook name/);
  assert.match(server, /app\.post\('\/api\/admin\/clubs\/import'/);
  assert.match(server, /knownClubAliases/);
  assert.match(server, /club_import_undo_state/);
  assert.match(server, /afterFingerprint/);
  assert.match(server, /records\.length > 25/);
  assert.match(importer, /rows\.length\s*>\s*2000/);
  assert.match(importer, /const chunkSize=25/);
  assert.ok(dashboard.includes("activeTool === 'excel-review'"), 'Automatic data refreshes must preserve the selected workbook and import progress');
  assert.ok(dashboard.includes("$('excelReviewFile')?.files?.length || $('excelImportConfirm')?.disabled"), 'A selected workbook or active import must be treated as unsaved work');
  const live = fs.readFileSync(path.join(root, 'services/admin-dashboard-live.js'), 'utf8');
  assert.ok(live.includes("'excel-review': ['Club', 'ClubAccount']"), 'Unrelated database updates must not reset the workbook review');
  assert.match(server, /assignNewClubRole\(\{ ClubAccount, session, email: row\.vicePresidentEmail, clubId: club\.id, role: 'vice_president' \}\)/);
  const html = renderDashboardPage(root, 'excel-review');
  assert.match(html, /data-tool="excel-review"/);
  assert.match(html, /pages\/admin-excel-import\.js/);
  assert.match(html, /cloudinary-upload\.js/);
  assert.ok(html.indexOf('pages/admin-excel-import.js') < html.indexOf('pages/admin-dashboard-v2.js'),
    'The importer must load before the dashboard initializes the selected tool');
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
