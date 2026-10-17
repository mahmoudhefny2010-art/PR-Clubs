const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const express = require('express');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
test('old club login redirects to normal sign-in while the club dashboard remains available', async t => {
  const app = express();
  const routes = source.slice(source.indexOf("app.get('/club-login',"), source.indexOf("app.get('/club-application.html',"));
  vm.runInNewContext(routes, { app, path, __dirname: root });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const origin = 'http://127.0.0.1:' + server.address().port;
  const response = await fetch(origin + '/club-login', { redirect: 'manual' });
  assert.equal(response.status, 303);
  assert.equal(response.headers.get('location'), '/pages/applicant-login.html?redirect=%2Fclub-dashboard');
  const dashboard = await fetch(origin + '/club-dashboard');
  assert.equal(dashboard.status, 200);
  const html = await dashboard.text();
  assert.match(html, /id="headDashboardView"/);
  assert.doesNotMatch(html, /id="clubLogin(?:View|Form|Email|Password)"/);
  assert.doesNotMatch(source, /app\.post\('\/api\/club-auth\/login'/);
  assert.match(source, /app\.post\('\/api\/auth\/login'/);
});
test('unauthenticated club access goes to normal sign-in; unavailable session checks offer retry without a login loop', async () => {
  const home = fs.readFileSync(path.join(root, 'public/assets/js/app-home.js'), 'utf8');
  const portal = home.slice(home.indexOf('async function openClubPortal('), home.indexOf('function setPresidentDashboardSection('));
  for (const available of [true, false]) {
    const destinations = [], rendered = [], nodes = [];
    const state = { applications: [1], clubAccount: {} };
    const open = vm.runInNewContext(portal + '; openClubPortal', {
      state, fetch: async () => ({ ok: available, json: async () => ({ authenticated: false }) }),
      window: { location: { replace: target => destinations.push(target) } },
      document: { documentElement: { classList: { remove() {} } }, createElement: tag => {
        const node = { tag, addEventListener() {} }; nodes.push(node); return node;
      } }, views: { authLoading: { replaceChildren() {} } }, showView: view => rendered.push(view)
    });
    await open();
    if (available) {
      assert.deepEqual(destinations, ['/pages/applicant-login.html?redirect=%2Fclub-dashboard']);
      assert.equal(state.clubAccount, null);
    } else {
      assert.deepEqual(destinations, []);
      assert.deepEqual(rendered, ['authLoading']);
      assert.equal(nodes.find(node => node.tag === 'button').textContent, 'Try again');
    }
  }
});
