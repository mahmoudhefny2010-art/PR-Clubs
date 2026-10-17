// Browser verification against in-memory fixtures; never reads .env or writes real website data.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const express = require('express');
const root = path.resolve(__dirname, '../..');
const output = path.join(root, '.frontend-audit', 'admin-dashboard-v2');
fs.mkdirSync(output, { recursive: true });
const app = express();
const httpSecurity = require('../../services/http-security');
app.use(httpSecurity.securityHeaders);
app.use('/api', httpSecurity.protectMutations);
const { respond } = require('./fixtures.cjs');
app.use(express.json());
const feedChecks = require('./feed-video-checks.cjs');
const feedState = feedChecks.install(app);
app.get(['/club-dashboard', '/club-login'], (req, res) => res.sendFile(path.join(root, 'public/index.html')));
const serverSource = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const guardSource = serverSource.slice(serverSource.indexOf('async function requireAdmin('), serverSource.indexOf('async function requireMiuEventsDashboard('));
const requireAdmin = vm.runInNewContext(`${guardSource}; requireAdmin`, {
  isSoftwareDevelopmentSession: async req => req.headers.cookie?.includes('fixture_developer=1'),
  hasAdminPassword: () => true,
  isAdminSessionValid: async req => req.headers.cookie?.includes('fixture_admin=1'), console
});
const { registerAdminDashboardPages, toolIds } = require('../../services/admin-dashboard-pages');
registerAdminDashboardPages(app, { root, requireAdmin });
const revisions = Object.fromEntries(toolIds.map(id => [id, 'fixture1']));
const streams = new Set();
function emitUpdate(keys) {
  for (const key of keys) revisions[key] = 'fixture' + Date.now();
  for (const res of streams) res.write(`event: invalidate\ndata: ${JSON.stringify({ keys, revisions })}\n\n`);
}
const requests = [];
let failSave = false;
let homepage = { title: 'Welcome to MIU Clubs', subtitle: 'Find your community.' };
const fixtures = {
  '/api/clubs': [{ id: 1, name: 'Science Club', committee: 'Science', tagline: 'Explore science', description: 'Our science community', requirements: 'Curiosity', category: 'Science', status: 'open', image: '/assets/img/pics/pwa-icon-192.png', imagePublicId: 'existing/club', applicants: 7, seats: 20, members: 12, applicationFields: [{ key: 'interest', label: 'Interest', type: 'text' }] }, { id: 2, name: 'Art Club', status: 'closed' }],
  '/api/admin/applications': [{ id: 1, studentName: '<Student>', email: 'student@example.test', clubId: 1, committee: 'PR', status: 'pending' }],
  '/api/admin/club-heads': [{ clubId: 1, clubName: 'Science Club', email: 'head@example.test', committee: 'PR' }],
  '/api/admin/clubs/archived': [{ id: 3, name: 'Archived Club', category: 'Arts' }],
  '/api/admin/club-members': [{ id: 1, name: 'Science Club', totalCount: 1, members: [{ name: 'Test Member', email: 'member@example.test', committee: 'PR' }] }],
  '/api/admin/visitor-analytics': { uniqueVisitors: 42, uniqueIpAddresses: 20, activeVisitors: 3, activeSignedInAccounts: 2, activeGuestVisitors: 1 },
  '/api/admin/system/data-status': { checkedAt: new Date().toISOString(), database: { connected: true }, sections: [{ title: 'Clubs', count: 2, detail: 'Saved clubs' }] }
};
fixtures['/api/site/account-session'] = { authenticated: true, name: 'Administrator', email: 'admin@example.test', role: 'admin' };
fixtures['/api/site/account-photo'] = null;
Object.assign(fixtures, {
  '/api/admin/staff-accounts': { roles: { president: 'Club president', head: 'Committee head', supervisor: 'Club supervisor', pr: 'Public relations', software_development: 'Software Development' }, clubs: [{ id: 1, name: 'Science Club' }, { id: 2, name: 'Art Club' }], accounts: [{ email: 'staff.member@miuegypt.edu.eg', assignments: [{ role: 'head', clubId: 1, committee: 'IT' }, { role: 'pr' }], updatedAt: '2026-10-15T10:00:00Z' }] },
  '/api/admin/supervisors': { clubs: [{ id: 1, name: 'Science Club' }, { id: 2, name: 'Art Club' }], accounts: [{ email: 'supervisor@miuegypt.edu.eg', assignedClubIds: [1], updatedAt: '2026-10-15T10:00:00Z' }] },
  '/api/report-downloads/clubs': { clubs: [{ id: 1, name: 'Science Club' }, { id: 2, name: 'Art Club' }], reports: true, attendance: true },
  '/api/report-downloads/events': { events: [], message: 'No published events in this period.' },
  '/api/admin/club-views': [{ clubId: 1, name: 'Science Club', views: 42 }],
  '/api/admin/event-analytics': { totals: { views: 42, registrations: 8, checkIns: 5, studentsInterested: 9 }, events: [{ clubName: 'Science Club', title: 'Science fair', date: '2026-10-15', views: 42, registrations: 8, studentInterest: 9, studentRegistrations: 7, checkIns: 5 }] },
  '/api/admin/login-settings': { email: 'admin@example.test', editable: false, environmentManaged: true },
  '/api/admin/university-content': [{ id: 1, title: 'MIU science fair', description: 'University science event', date: '2026-10-15', type: 'event', status: 'published' }],
  '/api/feedback/results/club': [{ id: 1, title: 'Science Club', count: 1, average: 4, responses: [{ email: 'student@example.test', value: 4, comment: 'Helpful sessions' }] }],
  '/api/feedback/results/university': [{ id: 1, title: 'MIU science fair', interaction: 'poll', question: 'Your preferred session?', count: 2, counts: [{ option: 'Robotics', count: 2 }], responses: [] }]
});
let committees = [{ committee: 'Organizing', status: 'open' }];
app.get('/api/admin/session', (req, res) => res.json({ configured: true, authenticated: Boolean(req.headers.cookie?.includes('fixture_admin=1')), localSetupAllowed: false }));
app.post('/api/admin/login', (req, res) => {
  if (req.body.email !== 'admin@example.test' || req.body.password !== 'Fixture-password-123') return res.status(401).json({ message: 'Fixture login rejected.' });
  res.setHeader('Set-Cookie', 'fixture_admin=1; Path=/; HttpOnly; SameSite=Lax');
  res.json({ authenticated: true });
});
app.use('/api/admin', requireAdmin);
app.get('/api/admin/dashboard-state', (req, res) => res.json({ cacheKey: 'fixture-session', revisions }));
app.get('/api/admin/dashboard-stream', (req, res) => {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store' }); res.flushHeaders();
  streams.add(res); res.on('close', () => streams.delete(res));
  res.write(`event: ready\ndata: ${JSON.stringify({ keys: [], revisions })}\n\n`);
});
app.use((req, res, next) => {
  if (!req.path.startsWith('/api/')) return next();
  requests.push({ method: req.method, path: req.path, body: req.body });
  if (req.path === '/api/site/account-photo') return res.json(fixtures[req.path]);
  if (req.path === '/api/admin/security/audit') return res.json({ googleSignInConfigured: true, logs: [{ actorEmail: 'admin@example.test', actorRole: 'admin', action: 'PATCH /api/admin/clubs/:id', timestamp: new Date().toISOString() }] });
  if (req.path === '/api/admin/dashboard-content-clubs') return res.json(fixtures['/api/clubs']);
  if (req.path === '/api/admin/clubs/1/committee-availability') {
    if (req.method === 'PUT') committees = req.body.committees;
    return res.json(committees);
  }
  if (req.path === '/api/admin/clubs/order') {
    assert.equal(req.method, 'PUT'); assert.deepEqual([...req.body.ids].sort(), [1, 2]);
    if (failSave) return res.status(500).json({ message: 'Fixture write failed.' });
    emitUpdate(['clubs']);
    return setTimeout(() => {
      req.body.ids.forEach((id, index) => { fixtures['/api/clubs'].find(club => club.id === id).sortOrder = index + 1; });
      res.json(req.body.ids.map(id => fixtures['/api/clubs'].find(club => club.id === id)));
    }, 350);
  }
  if (req.path === '/api/admin/accounts/password') { assert.equal(req.body.password, req.body.confirmPassword); return res.json({ message: 'Fixture password saved.' }); }
  if (req.path === '/api/admin/dashboard-clubs/1') return res.json(fixtures['/api/clubs'][0]);
  if (req.path === '/api/admin/clubs/1' && req.method === 'PATCH') {
    assert.equal(req.body.applicants, '7'); assert.equal(req.body.seats, '20');
    assert.equal(req.body.imagePublicId, undefined, 'Keeping an image does not revalidate it as a new upload');
    assert.equal(req.body.applicationFields[0].key, 'interest');
    fixtures['/api/clubs'][0] = { ...fixtures['/api/clubs'][0], ...req.body };
    return res.json(fixtures['/api/clubs'][0]);
  }
  if (decodeURIComponent(req.path) === '/api/admin/club-heads/head@example.test' && req.method === 'PATCH') {
    Object.assign(fixtures['/api/admin/club-heads'][0], req.body); return res.json(fixtures['/api/admin/club-heads'][0]);
  }
  if (req.path === '/api/admin/homepage') {
    if (req.method === 'PUT') {
      if (failSave) return res.status(503).json({ message: 'Fixture write failed.' });
      homepage = req.body;
    }
    return res.json(homepage);
  }
  if (req.method === 'PATCH' && req.path.endsWith('/status')) {
    fixtures['/api/admin/applications'][0].status = req.body.status;
    return res.json(fixtures['/api/admin/applications'][0]);
  }
  if (req.method === 'POST' && req.path.endsWith('/restore')) { fixtures['/api/admin/clubs/archived'] = []; return res.json({ restored: true }); }
  if (req.path === '/api/admin/accounts/password-reset') return res.json({ message: 'Fixture reset link sent.' });
  if (fixtures[req.path]) return res.json(fixtures[req.path]);
  const [status, data] = respond(new URL(req.url, 'http://localhost'), req.method, req.headers.referer || '', req.body);
  res.status(status).json(data);
});
app.use(express.static(path.join(root, 'public')));
const server = require('node:http').createServer(app);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
class CDP {
  constructor(url) {
    this.id = 0; this.pending = new Map(); this.events = [];
    this.socket = new WebSocket(url);
    this.ready = new Promise((resolve, reject) => { this.socket.onopen = resolve; this.socket.onerror = reject; });
    this.socket.onmessage = event => {
      const message = JSON.parse(event.data);
      if (!message.id) { this.events.push(message); return; }
      const item = this.pending.get(message.id); if (!item) return;
      clearTimeout(item.timer); this.pending.delete(message.id);
      message.error ? item.reject(new Error(message.error.message)) : item.resolve(message.result);
    };
  }
  async send(method, params = {}) {
    await this.ready;
    return new Promise((resolve, reject) => {
      const id = ++this.id;
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`Timed out: ${method}`)); }, 15000);
      this.pending.set(id, { resolve, reject, timer }); this.socket.send(JSON.stringify({ id, method, params }));
    });
  }
  async evaluate(expression) {
    const data = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (data.exceptionDetails) throw new Error(data.exceptionDetails.exception?.description || data.exceptionDetails.text);
    return data.result.value;
  }
}
let browser, cdp;
async function until(expression) {
  for (let i = 0; i < 80; i++) { if (await cdp.evaluate(expression)) return; await sleep(100); }
  throw new Error(`Condition not met: ${expression}`);
}
async function screenshot(name) {
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  fs.writeFileSync(path.join(output, `${name}.png`), Buffer.from(data, 'base64'));
}
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const anonymous = await fetch(`${origin}/admin`, { redirect: 'manual' });
  assert.equal(anonymous.status, 302, 'Anonymous users go to sign-in');
  assert.equal(anonymous.headers.get('location'), '/admin/login?returnTo=%2Fadmin');
  assert.equal(anonymous.headers.get('cache-control'), 'no-store');
  assert.equal((await fetch(`${origin}/api/admin/homepage`)).status, 401, 'APIs retain their authentication guard');
  const authenticated = await fetch(`${origin}/admin`, { headers: { cookie: 'fixture_admin=1' } });
  assert.equal(authenticated.status, 200); assert.equal(authenticated.headers.get('cache-control'), 'no-store');
  assert.equal((await fetch(`${origin}/admin`, { headers: { cookie: 'fixture_developer=1' } })).status, 200);
  const browserPath = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync);
  assert.ok(browserPath, 'Chrome or Edge required');
  browser = spawn(browserPath, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${path.join(output, `profile-${Date.now()}`)}`, '--no-first-run', '--disable-background-networking', '--disable-extensions', '--disable-gpu', 'about:blank'], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
  const endpoint = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Browser startup timed out')), 15000);
    browser.on('error', reject);
    browser.stderr.on('data', data => { const match = String(data).match(/DevTools listening on (ws:\/\/\S+)/); if (match) { clearTimeout(timer); resolve(match[1]); } });
  });
  const debugOrigin = new URL(endpoint).origin.replace('ws:', 'http:');
  const targets = await (await fetch(`${debugOrigin}/json/list`)).json();
  cdp = new CDP(targets.find(target => target.type === 'page').webSocketDebuggerUrl);
  await cdp.send('Page.enable'); await cdp.send('Runtime.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false });
  await cdp.send('Page.navigate', { url: `${origin}/admin` });
  await until("location.pathname==='/admin/login' && document.getElementById('adminLoginView')?.classList.contains('active')");
  await until("typeof openAdminAccess==='function' && !document.getElementById('adminLoginSubmit')?.disabled");
  await cdp.evaluate("document.getElementById('adminEmailInput').value='admin@example.test'; document.getElementById('adminPasswordInput').value='wrong-password'; document.getElementById('adminLoginForm').requestSubmit()");
  await until("document.getElementById('adminLoginFeedback').textContent==='Fixture login rejected.'");
  assert.equal(await cdp.evaluate('location.pathname'), '/admin/login', 'Failed login stays on login screen');
  await until("!document.documentElement.classList.contains('site-startup-pending') && !!document.querySelector('#site-header header')");
  for (const [width, height] of [[1440, 900], [1366, 650], [375, 812]]) {
    await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 760 });
    assert.equal(await cdp.evaluate("document.querySelector('#adminLoginView .login-wrap').getBoundingClientRect().width<=440"), true, 'Admin login uses the student login card width');
    assert.equal(await cdp.evaluate('document.documentElement.scrollWidth<=innerWidth'), true, 'Login fits narrow screens');
    assert.equal(await cdp.evaluate("getComputedStyle(document.getElementById('adminLoginSubmit')).width===getComputedStyle(document.getElementById('adminLoginForm')).width"), true, 'Sign-in button fills the form');
    await screenshot(`admin-login-${width}-${height}`);
  }
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false });
  await cdp.evaluate("document.getElementById('adminPasswordInput').value='Fixture-password-123'; document.getElementById('adminLoginForm').requestSubmit()");
  await until("location.pathname==='/admin'");
  await until(`document.querySelectorAll('.v2-widget').length===${toolIds.length} && document.getElementById('totalClubs').textContent==='2'`);
  assert.equal(await cdp.evaluate("getComputedStyle(document.getElementById('widgetGrid')).gridTemplateColumns.split(' ').length"), 4);
  assert.equal(await cdp.evaluate("document.querySelector('.v2-main').getBoundingClientRect().left >= document.querySelector('.v2-sidebar').getBoundingClientRect().right"), true, 'Sidebar stays next to content on desktop');
  assert.equal(await cdp.evaluate("document.getElementById('openClubs').textContent"), '1');
  for (const theme of ['light', 'dark']) {
    await cdp.evaluate(`document.documentElement.dataset.theme='${theme}'`);
    for (const width of [320, 375]) {
      await cdp.send('Emulation.setDeviceMetricsOverride', { width, height: 812, deviceScaleFactor: 1, mobile: true });
      assert.equal(await cdp.evaluate(`(() => {
        const brand=document.querySelector('.v2-admin-logo').getBoundingClientRect();
        const actions=document.querySelector('.v2-header-actions').getBoundingClientRect();
        const search=document.querySelector('.v2-header-search').getBoundingClientRect();
        const title=document.querySelector('.v2-admin-logo > span');
        return brand.bottom<=actions.top && actions.right<=innerWidth && search.right<=actions.left && title.scrollWidth<=title.clientWidth && document.documentElement.scrollWidth<=innerWidth;
      })()`), true, `Admin header fits two rows at ${width}px in ${theme} mode`);
      await screenshot(`admin-header-${theme}-${width}`);
    }
  }
  await cdp.evaluate("document.documentElement.dataset.theme='light'");
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false });
  if (process.argv.includes('--appearance-only')) {
    await require('./admin-tool-appearance-checks.cjs')({ cdp, origin, toolIds, until, screenshot });
    assert.deepEqual(cdp.events.filter(event => event.method === 'Runtime.exceptionThrown'), [], 'No browser script errors');
    return;
  }
  if (!process.argv.includes('--feed-only') && !process.argv.includes('--event-info-only')) await require('./admin-dashboard-page-checks.cjs')({ cdp, origin, requests, homepage: () => homepage, fixtures, setFailSave: value => { failSave = value; }, emitUpdate, until, screenshot });
  if (!process.argv.includes('--event-info-only')) await feedChecks.run({ cdp, origin, fixtures, state: feedState, until, screenshot });
  await cdp.send('Page.navigate', { url: origin + '/' });
  await until("document.getElementById('clubGrid')?.children.length>0 && document.getElementById('homeView')?.classList.contains('active')");
  await cdp.send('Page.navigate', { url: origin + '/club-dashboard' });
  await until("document.getElementById('headDashboardView')?.classList.contains('active')");
  await cdp.evaluate("document.querySelector('[data-dashboard-section=\"presidentFormManager\"]').click(); loadPresidentApplicationForm().then(() => loadInterviewForm())");
  await until("typeof loadPresidentApplicationForm==='function' && typeof loadInterviewForm==='function' && typeof openApplicationForm==='function'");
  await require('./member-removal-checks.cjs')({ cdp, until, screenshot });
  await require('./event-info-checks.cjs')({ cdp, origin, fixtures, requests, until, screenshot });
  const errors = cdp.events.filter(event => event.method === 'Runtime.exceptionThrown');
  assert.deepEqual(errors, [], 'No browser script errors');
  console.log(process.argv.includes('--event-info-only') ? 'PASS: focused Event Info popup checks and shared-page initialization. Fixture data only.' : process.argv.includes('--feed-only') ? 'PASS: feed image/video uploads, draft editing, review submission, lazy video playback and responsive layout. Fixture writes only.' : 'PASS: 27 protected dashboard tools, card drag ordering, cache/live updates, permissions, saves, offline mode and feed image/video uploads, editing, review submission and playback. Fixture writes only.');
  console.log(`Screenshots: ${output}`);
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  if (cdp) { await cdp.send('Browser.close').catch(() => {}); cdp.socket.close(); }
  if (browser && !browser.killed) browser.kill();
  server.closeAllConnections(); server.close();
});
