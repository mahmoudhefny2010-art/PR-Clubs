const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const express = require('express');
const root = path.resolve(__dirname, '..');
const { registerAdminDashboardPages, toolIds } = require('../services/admin-dashboard-pages');
test('one protected administrator dashboard replaces retired pages and preserves bookmarked tool queries', async t => {
  const app = express();
  registerAdminDashboardPages(app, { root, requireAdmin(req, res, next) {
    if (req.get('cookie') === 'fixture=authorized') return next();
    res.redirect('/admin/login?returnTo=' + encodeURIComponent(req.originalUrl));
  } });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = 'http://127.0.0.1:' + server.address().port;
  for (const [old, destination] of [['/admin/global', '/admin'], ['/admin/dashboard-v2', '/admin'], ['/admin/dashboard-v2/clubs?club=12', '/admin/clubs?club=12']]) {
    const response = await fetch(base + old, { redirect: 'manual' });
    assert.equal(response.status, 308); assert.equal(response.headers.get('location'), destination);
  }
  assert.equal(toolIds.includes('club-accounts'), false);
  for (const removed of ['/admin/club-accounts', '/admin/club-credentials', '/admin/dashboard-v2/club-accounts']) {
    const response = await fetch(base + removed, { redirect: 'manual', headers: { cookie: 'fixture=authorized' } });
    assert.equal(response.status, 303);
    assert.equal(response.headers.get('location'), '/admin');
  }
  assert.equal((await fetch(base + '/admin/login')).status, 200);
  for (const tool of ['', ...toolIds]) {
    const url = '/admin' + (tool ? '/' + tool : '');
    const anonymous = await fetch(base + url, { redirect: 'manual' });
    assert.equal(anonymous.status, 302); assert.equal(anonymous.headers.get('location'), '/admin/login?returnTo=' + encodeURIComponent(url));
    const response = await fetch(base + url, { headers: { cookie: 'fixture=authorized' } });
    assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store');
    const html = await response.text();
    assert.ok(html.includes(`data-tool="${tool}"`)); assert.doesNotMatch(html, /Administration preview|v2-preview|id="adminView"|\/admin\/global/);
  }
  for (const file of ['private/global-admin.html', 'private/admin-club-credentials.html', 'public/assets/js/app-admin.js', 'public/assets/js/admin-data-status.js', 'public/assets/js/university-content-admin.js']) assert.equal(fs.existsSync(path.join(root, file)), false, file);
  const homepage = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
  assert.doesNotMatch(homepage, /id="(?:adminView|adminLoginView|archivedClubsModal|adminDataStatusDialog)"|app-admin\.js/);
  assert.match(homepage, /app-forms\.js/);
});
test('admin sign-in returns to safe canonical tool links and rejects external and login-loop destinations', () => {
  const source = fs.readFileSync(path.join(root, 'public/assets/js/pages/admin-login.js'), 'utf8');
  const start = source.indexOf('function getAdminDestination()');
  const snippet = source.slice(start, source.indexOf('function setAdminLoginFeedback', start));
  for (const [target, expected] of [['/admin/clubs?club=12', '/admin/clubs?club=12'], ['/admin', '/admin'], ['https://outside.test/admin', '/admin'], ['//outside.test/admin', '/admin'], ['/admin/login', '/admin'], ['/admin/login?returnTo=/admin', '/admin'], ['/admin/global', '/admin']]) {
    const result = vm.runInNewContext(snippet + ';getAdminDestination()', { URLSearchParams, location: { search: '?returnTo=' + encodeURIComponent(target) } });
    assert.equal(result, expected);
  }
});
