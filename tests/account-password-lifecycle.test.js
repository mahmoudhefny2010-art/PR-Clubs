const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');
const express = require('express');
const { ClubAccount: AccountModel } = require('../models');
const { registerSupervisorAdmin } = require('../services/supervisor-admin');
const { registerStaffAccountAdmin } = require('../services/staff-account-admin');
const { matchesAccountPassword, hashAccountPassword } = require('../services/account-passwords');
const source = fs.readFileSync(require.resolve('../server'), 'utf8');
const firstPassword = 'Test-first-password-123';
const secondPassword = 'Test-second-password-456';

async function fixture(t) {
  const records = new Map(); let available = true; let failConfirmation = false; let studentShadow = null;
  function query(value) {
    let majority = false;
    return { read() { return this; }, select() { return this; }, sort() { return this; },
      readConcern() { majority = true; return this; },
      async lean() { if (majority && failConfirmation) throw new Error('READ_CONFIRMATION_FAILED'); return value?.toObject ? value.toObject() : value; },
      then(resolve, reject) { return Promise.resolve(value).then(resolve, reject); } };
  }
  const ClubAccount = {
    findOne: filter => query(records.get(filter.email) || null),
    async create(value) { const account = new AccountModel(value); await account.validate(); records.set(value.email, account); return account; },
    findOneAndUpdate(filter, update) {
      const account = [...records.values()].find(record => String(record._id) === String(filter._id));
      if (!account || filter.role && account.role !== filter.role || filter.sessionVersion !== undefined && account.sessionVersion !== filter.sessionVersion) return query(null);
      Object.assign(account, update.$set); account.sessionVersion += update.$inc?.sessionVersion || 0;
      return query(account);
    }
  };
  const app = express(); app.use(express.json());
  const context = {
    app, crypto, ClubAccount, StudentAccount: { findOne: () => query(studentShadow) }, mongoReady: true,
    clubAccounts: [], checkLoginSourceLock: async () => false, countLoginSourceFailure: async () => false,
    clearLoginSourceFailures: async () => true, recordSuccessfulSignIn: async () => {},
    emailMatches: () => false, passwordMatches: async () => false,
    clubPasswordMatches: matchesAccountPassword, setClubSessionCookie: (req, res) => res.setHeader('Set-Cookie', 'test-only'),
    secureCookieSuffix: () => '',
    console: { error() {} }
  };
  vm.createContext(context);
  const start = source.indexOf("app.post('/api/auth/login',");
  const end = source.indexOf("app.post('/api/admin/setup'", start);
  vm.runInContext(source.slice(start, end), context);
  app.use('/api/admin', (req, res, next) => req.headers['x-admin'] === 'yes' ? next() : res.status(403).json({ message: 'Admin required' }));
  const deps = { ClubAccount, Club: { countDocuments: async () => 1 }, StudentAccount: { exists: async () => false },
    databaseReady: () => available, sameOrigin: () => true, refreshAccount: account => { context.clubAccounts = [account]; } };
  registerSupervisorAdmin(app, deps); registerStaffAccountAdmin(app, deps);
  const server = await new Promise(resolve => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); });
  t.after(() => new Promise(resolve => server.close(resolve)));
  async function request(path, body, method = 'PUT') {
    const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, {
      method, headers: { 'Content-Type': 'application/json', 'x-admin': 'yes' }, body: JSON.stringify(body)
    });
    return { status: response.status, body: await response.json() };
  }
  return { records, request, context, fail: () => { failConfirmation = true; },
    offline: () => { available = false; context.mongoReady = false; }, shadow: value => { studentShadow = value; } };
}

test('supervisor creation saves a usable password; replacement rejects the old password and preserves Google binding', async t => {
  const state = await fixture(t);
  const email = 'test-supervisor@edu.eg';
  const payload = { email, assignedClubIds: [1], password: firstPassword, confirmPassword: firstPassword };
  const created = await state.request('/api/admin/supervisors', payload);
  assert.equal(created.status, 200); assert.equal(created.body.savedToDatabase, true); assert.equal(created.body.passwordUpdated, true);
  assert.equal((await state.request('/api/auth/login', { email, password: firstPassword }, 'POST')).status, 200);
  const original = state.records.get(email).toObject();
  state.records.get(email).googleSub = 'preserved-google-subject';
  const updated = await state.request('/api/admin/supervisors', { ...payload, password: secondPassword, confirmPassword: secondPassword });
  assert.equal(updated.status, 200); assert.equal(updated.body.savedToDatabase, true);
  const saved = state.records.get(email);
  assert.notEqual(saved.salt, original.salt); assert.notEqual(saved.passwordHash, original.passwordHash);
  assert.equal(saved.googleSub, 'preserved-google-subject'); assert.equal(saved.sessionVersion, original.sessionVersion + 1);
  assert.equal((await state.request('/api/auth/login', { email, password: firstPassword }, 'POST')).status, 401);
  assert.equal((await state.request('/api/auth/login', { email, password: secondPassword }, 'POST')).status, 200);
  state.context.clubAccounts = [original];
  state.offline();
  assert.equal((await state.request('/api/auth/login', { email, password: firstPassword }, 'POST')).status, 503);
});
test('every dashboard role can be created with an explicit password and sign in immediately', async t => {
  const state = await fixture(t);
  for (const role of ['president', 'head', 'supervisor', 'pr', 'english', 'security', 'sso', 'dean', 'software_development']) {
    const email = `${role}@miuegypt.edu.eg`;
    const result = await state.request('/api/admin/staff-accounts', { email, role,
      assignedClubIds: ['president', 'head', 'supervisor'].includes(role) ? [1] : [], committee: 'IT',
      password: firstPassword, confirmPassword: firstPassword });
    assert.equal(result.status, 200, role);
    const login = await state.request('/api/auth/login', { email, password: firstPassword }, 'POST');
    assert.equal(login.status, 200, role); assert.equal(login.body.role, role);
  }
});
test('confirmation mismatch never writes; an unconfirmed database read never reports success', async t => {
  const state = await fixture(t);
  const payload = { email: 'staff@miuegypt.edu.eg', role: 'pr', assignedClubIds: [], password: firstPassword, confirmPassword: 'different-password' };
  assert.equal((await state.request('/api/admin/staff-accounts', payload)).status, 400);
  assert.equal(state.records.size, 0);
  state.fail();
  assert.equal((await state.request('/api/admin/staff-accounts', { ...payload, confirmPassword: firstPassword })).status, 503);
});
test('blank password preserves the existing password; a student record cannot revive an old staff password', async t => {
  const state = await fixture(t); const email = 'staff@miuegypt.edu.eg';
  const payload = { email, role: 'pr', assignedClubIds: [], password: secondPassword, confirmPassword: secondPassword };
  assert.equal((await state.request('/api/admin/staff-accounts', payload)).status, 200);
  assert.equal((await state.request('/api/admin/staff-accounts', { ...payload, password: '', confirmPassword: '' })).status, 200);
  state.shadow({ email, ...await hashAccountPassword(firstPassword) });
  assert.equal((await state.request('/api/auth/login', { email, password: firstPassword }, 'POST')).status, 401);
  assert.equal((await state.request('/api/auth/login', { email, password: secondPassword }, 'POST')).status, 200);
});
