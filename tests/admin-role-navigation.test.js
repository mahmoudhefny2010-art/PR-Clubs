const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

test('delegated administrator requires a live verified modern staff session and loses access on role change', async () => {
  const source = fs.readFileSync(require.resolve('../server'), 'utf8');
  const method = source.slice(source.indexOf('async function isSoftwareDevelopmentSession(req) {'), source.indexOf('function setAdminSessionCookie'));
  let account = { role: 'software_development' };
  const context = { mongoReady: true, Buffer, clubAccounts: [], mongoose: { isSqlProvider: false }, readAdminSessionData: require('../services/admin-session-read').readAdminSessionData, getClubAccountFromRequest: async () => account };
  vm.createContext(context); vm.runInContext(method, context);
  const request = { headers: { cookie: 'miu_club=0.email.expiry.1.signature' } };
  assert.equal(await context.isAdminSessionValid(request), true);
  account = { role: 'dean' };
  assert.equal(await context.isAdminSessionValid(request), false);
  account = null;
  assert.equal(await context.isAdminSessionValid(request), false);
  account = { role: 'software_development' };
  context.mongoReady = false;
  context.ensureReady = async () => {};
  await assert.rejects(context.isAdminSessionValid(request), { code: 'DATABASE_UNAVAILABLE' });
  context.ensureReady = async () => { context.mongoReady = true; };
  assert.equal(await context.isAdminSessionValid(request), true);
  assert.equal(await context.isAdminSessionValid({ headers: { cookie: 'miu_club=0.expiry.signature' } }), false);
});

test('Software Development team receives the full admin guard even without global password setup', async () => {
  const source = fs.readFileSync(require.resolve('../server'), 'utf8');
  const method = source.slice(source.indexOf('async function requireAdmin(req, res, next) {'), source.indexOf('function clubPasswordMatches'));
  let delegated = true; let nextCalled = false; let statusCode = 0;
  const context = {
    isSoftwareDevelopmentSession: async () => delegated,
    hasAdminPassword: () => false,
    isAdminSessionValid: async () => false,
    console,
  };
  vm.createContext(context); vm.runInContext(method, context);
  const response = { status(code) { statusCode = code; return this; }, json() { return this; } };
  await context.requireAdmin({ headers: { cookie: 'signed-staff-session' } }, response, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
  delegated = false; nextCalled = false; statusCode = 0;
  await context.requireAdmin({ headers: {} }, response, () => { nextCalled = true; });
  assert.equal(nextCalled, false);
  assert.equal(statusCode, 503);
});

function navigation(referrer, stored = null) {
  const code = fs.readFileSync(require.resolve('../public/assets/js/layout.js'), 'utf8').split('window.formatSiteTime')[0];
  const calls = [];
  const location = { origin: 'https://clubs.example', href: 'https://clubs.example/current', pathname: '/current', search: '', hash: '', assign: value => calls.push(value) };
  const context = { URL, location, window: {}, history: { length: 4, back: () => calls.push('history-back') },
    document: { referrer, addEventListener() {} }, sessionStorage: { getItem: () => JSON.stringify(stored), setItem() {} } };
  vm.runInNewContext(code, context);
  context.window.miuGoBack('/fallback');
  return calls;
}
test('Back returns to same-site context and excludes external or login pages', () => {
  assert.deepEqual(navigation('https://clubs.example/events'), ['history-back']);
  assert.deepEqual(navigation('https://outside.example/'), ['/fallback']);
  assert.deepEqual(navigation('https://clubs.example/pages/applicant-login.html', { current: '/events' }), ['/events']);
  assert.deepEqual(navigation('', { current: '/current', previous: '/events' }), ['/events']);
  assert.deepEqual(navigation(''), ['/fallback']);
});

test('descriptive Exit buttons return to the single saved previous page', () => {
  const source = fs.readFileSync(require.resolve('../public/assets/js/layout.js'), 'utf8').split('window.formatSiteTime')[0];
  const calls = []; let clickListener;
  const location = { origin: 'https://clubs.example', href: 'https://clubs.example/current', pathname: '/current', search: '', hash: '', assign: value => calls.push(value) };
  const context = {
    URL, location, window: {}, history: { length: 8, back: () => calls.push('history-back') },
    document: { referrer: '', addEventListener: (name, callback) => { if (name === 'click') clickListener = callback; } },
    sessionStorage: { getItem: () => JSON.stringify({ current: '/current', previous: '/immediate' }), setItem() {} }
  };
  vm.runInNewContext(source, context);
  const control = { textContent: 'Exit to dashboard', hasAttribute: () => false, getAttribute: () => '/fallback', closest: () => null };
  const event = { button: 0, target: { closest: () => control }, preventDefault() {}, stopImmediatePropagation() {} };
  clickListener(event);
  assert.deepEqual(calls, ['/immediate']);
});
