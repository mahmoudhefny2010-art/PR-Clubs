const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');
const source = fs.readFileSync(require.resolve('../server'), 'utf8');
test('staff session survives a day of inactivity and a new instance, reconnects storage, and still enforces revocation and expiry', async () => {
  let now = Date.now();
  let account = { email: 'fixture@example.test', clubId: 1, role: 'president', sessionVersion: 3 };
  const context = { crypto, Buffer, Date: { now: () => now }, sessionSecret: 'fixture-stable-secret', mongoReady: true, clubAccounts: [],
    ClubAccount: { findOne: () => ({ lean: async () => account }) },
    ensureReady: async () => { context.mongoReady = true; },
    require: name => name === './services/staff-google-auth' ? require('../services/staff-google-auth') : require(name)
  };
  vm.createContext(context);
  vm.runInContext(source.slice(source.indexOf('function createClubSession(account'), source.indexOf('function setClubSessionCookie')), context);
  const cookie = context.createClubSession(account);
  assert.equal(Number(cookie.split('.')[2]) - now, 7 * 24 * 60 * 60 * 1000);
  now += 24 * 60 * 60 * 1000;
  const req = { headers: { cookie: 'miu_club=' + cookie } };
  context.mongoReady = false;
  assert.equal((await context.getClubAccountFromRequest(req)).email, account.email);
  account = { ...account, sessionVersion: 4 };
  assert.equal(await context.getClubAccountFromRequest(req), null);
  account = { ...account, sessionVersion: 3 };
  now += 7 * 24 * 60 * 60 * 1000;
  assert.equal(await context.getClubAccountFromRequest(req), null);
});
test('administrator tokens and persistent cookies share a seven-day expiry and retain secure cookie flags', () => {
  const now = Date.now(), context = { crypto, Date: { now: () => now }, sessionSecret: 'fixture-stable-secret', adminAuthState: { sessionVersion: 9 },
    getConfiguredAdminEmail: () => 'fixture@example.test', secureCookieSuffix: () => 'Secure;' };
  vm.createContext(context);
  vm.runInContext(source.slice(source.indexOf('function createAdminSession()'), source.indexOf('async function isSoftwareDevelopmentSession(')), context);
  vm.runInContext(source.slice(source.indexOf('function setAdminSessionCookie('), source.indexOf('async function requireAdmin(')), context);
  let cookie;
  context.setAdminSessionCookie({}, { setHeader: (_name, value) => { cookie = value; } });
  assert.equal(Number(cookie.split('=')[1].split('.')[0]) - now, 7 * 24 * 60 * 60 * 1000);
  assert.match(cookie, /Max-Age=604800; HttpOnly; SameSite=Strict; Path=\/;Secure;/);
});
