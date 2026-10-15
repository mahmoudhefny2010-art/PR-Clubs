const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');
const express = require('express');
const cors = require('cors');
const security = require('../services/http-security');
const { auditMiddleware } = require('../services/security-audit');
const { publicAbuseLimits } = require('../services/public-abuse-limits');
const { sanitizePublicClub, publicClubProjection } = require('../services/public-club-media');
const { validSponsorAttachment } = require('../services/attachment-validation');
const values = require('../database/values');
const source = fs.readFileSync(require.resolve('../server'), 'utf8');
const fragment = (from, to) => source.slice(source.indexOf(from), source.indexOf(to, source.indexOf(from)));
async function listen(t, app) {
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  return `http://127.0.0.1:${server.address().port}`;
}
test('unsafe requests require the exact origin; foreign CORS and page framing are blocked', async t => {
  const app = express(); let writes = 0;
  app.disable('x-powered-by'); app.use(security.securityHeaders); app.use(cors(security.sameOriginCors)); app.use('/api', security.protectMutations); app.use(express.json());
  app.get('/api/check', (req, res) => res.json({ ok: true }));
  app.post('/api/check', (req, res) => { writes++; res.json({ ok: true }); });
  const origin = await listen(t, app);
  for (const headers of [{}, { Origin: 'https://attacker.example' }, { Origin: origin + '.attacker.example' }, { Origin: origin, 'Sec-Fetch-Site': 'cross-site' }]) {
    assert.equal((await fetch(origin + '/api/check', { method: 'POST', headers })).status, 403);
  }
  assert.equal(writes, 0);
  const allowed = await fetch(origin + '/api/check', { method: 'POST', headers: { Origin: origin } });
  assert.equal(allowed.status, 200); assert.equal(writes, 1);
  assert.equal(allowed.headers.get('x-frame-options'), 'DENY');
  assert.equal(allowed.headers.get('x-content-type-options'), 'nosniff');
  assert.match(allowed.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  assert.ok(allowed.headers.get('content-security-policy-report-only'));
  assert.equal(allowed.headers.get('x-powered-by'), null);
  const foreign = await fetch(origin + '/api/check', { headers: { Origin: 'https://attacker.example' } });
  assert.equal(foreign.headers.get('access-control-allow-origin'), null);
});
test('admin and staff cookies use the production secure policy even behind an HTTP proxy socket', () => {
  assert.match(security.secureCookie({ secure: false }, { NODE_ENV: 'production' }), /Secure/);
  assert.match(security.secureCookie({ secure: false }, { VERCEL: '1' }), /Secure/);
  assert.equal(security.secureCookie({ secure: false }, {}), '');
  for (const [from, to] of [['function setAdminSessionCookie(', 'async function requireAdmin('], ['function setClubSessionCookie(', 'function getStaffDashboardOptions(']]) {
    assert.match(fragment(from, to), /secureCookieSuffix\(req\)/);
  }
});
test('configured and production administrators cannot be overwritten through web setup', async () => {
  for (const env of [{ ALLOW_LOCAL_ADMIN_SETUP: 'true' }, { NODE_ENV: 'production', ALLOW_LOCAL_ADMIN_SETUP: 'true' }, { VERCEL: '1' }]) {
    let handler, writes = 0;
    const context = { process: { env }, httpSecurity: security, hasAdminPassword: () => env.NODE_ENV !== 'production', app: { post: (path, callback) => { handler = callback; } }, writeJsonFile: () => { writes++; } };
    vm.createContext(context); vm.runInContext(fragment("app.post('/api/admin/setup'", "app.post('/api/admin/login'"), context);
    const res = { status(value) { this.code = value; return this; }, json() {} };
    await handler({ socket: { remoteAddress: '127.0.0.1' }, body: {} }, res);
    assert.equal(res.code, 403); assert.equal(writes, 0);
  }
});
test('another account cannot clear a target login lock or the shared abuse counter', async () => {
  const context = { crypto, httpSecurity: security, process: { env: {} }, sessionSecret: 'fixture', mongoReady: false, loginAttempts: new Map(), MAX_LOGIN_FAILURES: 5, LOGIN_LOCK_MS: 900000 };
  vm.createContext(context); vm.runInContext(fragment('function loginAttemptKey(', 'function sendLoginLockResponse('), context);
  const victim = { headers: {}, ip: '192.0.2.1', body: { email: 'Victim@example.test' } }, other = { ...victim, body: { email: 'other@example.test' } };
  const key = context.loginAttemptKey(victim), aggregate = context.loginAttemptKey(victim, 'source');
  assert.notEqual(key, context.loginAttemptKey(other));
  for (let i = 0; i < 4; i++) { await context.recordLoginFailure(key); await context.recordLoginFailure(aggregate, 100); }
  await context.clearLoginFailures(context.loginAttemptKey(other));
  await context.recordLoginFailure(key);
  assert.ok(await context.loginLockExpiry(key));
  assert.equal(context.loginAttempts.get(aggregate).failures, 4);
});
test('public response shaping removes interview forms, private agreements, contacts and unrecognized nested fields', () => {
  const input = { id: 1, name: 'Club', interviewForms: [{ sections: ['private'] }], memberRoster: [{ email: 'private@example.test' }], sponsors: [{ title: 'Sponsor', sponsorLogo: 'logo.jpg', sponsorAttachment: 'private.pdf', sponsorEmail: 'private@example.test', secret: 'internal' }], posts: [{ title: 'Post', text: 'Hello', image: 'https://res.cloudinary.com/demo/video/upload/post.mp4' }] };
  const shaped = sanitizePublicClub(input);
  assert.equal(shaped.interviewForms, undefined); assert.equal(shaped.memberRoster, undefined);
  assert.equal(shaped.sponsors[0].sponsorAttachment, undefined); assert.equal(shaped.sponsors[0].sponsorEmail, undefined); assert.equal(shaped.sponsors[0].secret, undefined);
  assert.equal(shaped.posts[0].image, input.posts[0].image);
  const projected = values.projection(input, publicClubProjection());
  assert.equal(projected.interviewForms, undefined); assert.equal(projected.sponsors[0].sponsorAttachment, undefined);
});
test('private attachment validation rejects MIME spoofing, script URLs, HTML and oversized files', () => {
  assert.equal(validSponsorAttachment('data:application/pdf;base64,' + Buffer.from('%PDF-1.7\nfixture').toString('base64')), true);
  for (const source of ['javascript:alert(1)', 'data:text/html;base64,PHNjcmlwdD4=', 'data:application/pdf;base64,' + Buffer.from('<html>not a PDF</html>').toString('base64'), 'https://attacker.example/file.pdf']) assert.equal(validSponsorAttachment(source), false);
  assert.equal(validSponsorAttachment('data:application/pdf;base64,' + Buffer.alloc(3 * 1024 * 1024 + 1).toString('base64')), false);
});
test('security audit awaits persistence, redacts secrets and records actor/result without request bodies', async t => {
  const entries = [], app = express(); app.use(express.json());
  app.use((req, res, next) => { req.securityActor = { email: 'admin@example.test', role: 'admin' }; next(); });
  app.use(auditMiddleware({ model: { create: async entry => { await new Promise(resolve => setTimeout(resolve, 5)); entries.push(entry); } }, ready: () => true, ip: () => '192.0.2.1', adminEmail: () => '' }));
  app.post('/api/admin/accounts/password', (req, res) => res.json({ ok: true }));
  const origin = await listen(t, app);
  const response = await fetch(origin + '/api/admin/accounts/password?token=do-not-log', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'do-not-log', cookie: 'do-not-log', token: 'do-not-log' }) });
  assert.equal(response.status, 200); assert.equal(entries.length, 1);
  assert.equal(entries[0].actorRole, 'admin'); assert.ok(Number.isSafeInteger(entries[0].id));
  assert.equal(JSON.stringify(entries).includes('do-not-log'), false);
});
test('public abuse limits share database counts across app instances and fail closed when storage is unavailable', async t => {
  const rows = new Map();
  const model = { findOneAndUpdate(filter, update) { return { lean: async () => { const record = values.update(rows.get(filter.sourceHash) || {}, update); rows.set(filter.sourceHash, record); return record; } }; } };
  const app = express(); let ready = true;
  app.use(publicAbuseLimits({ model, ready: () => ready, ip: () => '192.0.2.2', secret: () => 'fixture' }));
  app.post('/api/ask-ai', (req, res) => res.json({ ok: true }));
  const origin = await listen(t, app);
  for (let i = 0; i < 20; i++) assert.equal((await fetch(origin + '/api/ask-ai', { method: 'POST' })).status, 200);
  const blocked = await fetch(origin + '/api/ask-ai', { method: 'POST' });
  assert.equal(blocked.status, 429); assert.ok(blocked.headers.get('retry-after'));
  ready = false; assert.equal((await fetch(origin + '/api/ask-ai', { method: 'POST' })).status, 503);
});
