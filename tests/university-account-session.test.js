const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { resolveUniversityStudentProfile } = require('../services/university-account-session');
const identity = { email: 'student@miuegypt.edu.eg', googleSub: 'verified-google-subject', name: 'Test Student' };
const query = value => ({ read() { return this; }, lean: async () => value });
function model(initial = []) {
  const records = [...initial]; let writes = 0;
  return {
    records, get writes() { return writes; },
    findOne(filter) { return query(records.find(row => Object.entries(filter).every(([key, value]) => row[key] === value)) || null); },
    findOneAndUpdate(filter, update) {
      let row = records.find(row => row.email === filter.email);
      if (!row) { row = { _id: 'student-1', ...update.$setOnInsert, sessionVersion: 0 }; records.push(row); writes++; }
      return query(row);
    }
  };
}
test('verified Google staff identity reuses student profile without resetting password, profile or sessions', async () => {
  const existing = { _id: 'old-id', email: identity.email, name: 'Saved Name', passwordHash: 'saved-password', major: 'Engineering', sessionVersion: 8 };
  const db = model([existing]);
  assert.equal(await resolveUniversityStudentProfile(db, identity), existing);
  assert.equal(db.writes, 0);
  assert.equal(existing.sessionVersion, 8);
  assert.equal(existing.googleSub, undefined, 'Never silently links an existing password account to Google');
});
test('parallel student features create one profile for the signed-in Google identity', async () => {
  const db = model();
  const results = await Promise.all(Array.from({ length: 6 }, () => resolveUniversityStudentProfile(db, identity)));
  assert.equal(db.records.length, 1);
  assert.equal(db.writes, 1);
  assert.ok(results.every(account => account._id === 'student-1' && account.email === identity.email));
  assert.equal(db.records[0].name, identity.name);
});
test('unverified, non-university and conflicting Google identities never gain student access', async () => {
  const db = model();
  assert.equal(await resolveUniversityStudentProfile(db, { ...identity, googleSub: '' }), null);
  assert.equal(await resolveUniversityStudentProfile(db, { ...identity, email: 'someone@example.com' }), null);
  assert.equal(db.writes, 0);
  assert.equal(await resolveUniversityStudentProfile(model([{ ...identity, _id: 'other', email: 'other@miuegypt.edu.eg' }]), identity), null);
  assert.equal(await resolveUniversityStudentProfile(model([{ ...identity, _id: 'other', googleSub: 'different-subject' }]), identity), null);
});
function sessionFixture(staff, admin = null) {
  const source = fs.readFileSync(require.resolve('../server'), 'utf8');
  const start = source.indexOf('async function getGoogleStudentAccountFromRequest');
  const end = source.indexOf('async function requireStudentAuth', start);
  const db = model();
  const context = {
    mongoReady: true, StudentAccount: db,
    getClubAccountFromRequest: async req => req.headers.cookie?.includes('valid-staff') ? staff : null,
    isAdminSessionValid: async req => Boolean(admin && req.headers.cookie?.includes('valid-admin')),
    loadAdminAuthState: async () => admin, getConfiguredAdminEmail: () => identity.email,
    require: () => ({ resolveUniversityStudentProfile })
  };
  vm.createContext(context); vm.runInContext(source.slice(start, end), context);
  return { db, get: context.getStudentAccountFromRequest };
}
test('existing Google role session accesses student features without another login or student cookie', async () => {
  for (const role of ['president', 'head', 'dean', 'software_development', 'supervisor']) {
    const state = sessionFixture({ ...identity, role, roleAssignments: [{ role }, { role: 'pr' }] });
    const account = await state.get({ headers: { cookie: 'miu_club=valid-staff' } });
    assert.equal(account.email, identity.email);
    assert.equal((await state.get({ headers: { cookie: 'miu_club=valid-staff' } }))._id, account._id);
    assert.equal(await state.get({ headers: { cookie: 'miu_club=valid-staff' } }, undefined, false), null, 'Header keeps staff identity and dashboard choices');
  }
});
test('validated Google admin session works; absent, revoked and password-only role sessions do not', async () => {
  assert.equal((await sessionFixture(null, identity).get({ headers: { cookie: 'miu_admin=valid-admin' } })).email, identity.email);
  assert.equal(await sessionFixture(identity).get({ headers: { cookie: 'miu_club=revoked-session' } }), null);
  assert.equal(await sessionFixture({ email: identity.email }).get({ headers: { cookie: 'miu_club=valid-staff' } }), null);
  assert.equal(await sessionFixture(identity).get({ headers: {} }), null);
  assert.equal(await sessionFixture(identity).get({ headers: { cookie: 'miu_student=invalid; miu_club=valid-staff' } }), null);
});
test('logout clears every role cookie so Google role access cannot silently restore a signed-out account', () => {
  const source = fs.readFileSync(require.resolve('../server'), 'utf8');
  for (const url of ['/api/student-auth/logout', '/api/club-auth/logout', '/api/admin/logout']) {
    const start = source.indexOf(`app.post('${url}'`), end = source.indexOf('\n});', start);
    const handler = source.slice(start, end);
    for (const name of ['miu_student', 'miu_club', 'miu_admin']) assert.ok(handler.includes(name), `${url} clears ${name}`);
  }
});

test('event registration status accepts the existing Google multi-role cookie without a second sign-in', async t => {
  const express = require('express');
  const { registerStudentEvents } = require('../services/student-event-registration');
  const state = sessionFixture({ ...identity, role: 'head', roleAssignments: [{ role: 'head' }, { role: 'pr' }] });
  const source = fs.readFileSync(require.resolve('../server'), 'utf8');
  const start = source.indexOf('async function requireStudentAuth');
  const end = source.indexOf('async function getSpeakerRequester', start);
  const context = { mongoReady: true, getStudentAccountFromRequest: state.get, reverseAttendanceService: { bindDevice: async () => {} }, console };
  vm.createContext(context); vm.runInContext(source.slice(start, end), context);
  const app = express();
  registerStudentEvents(app, {
    requireStudentAuth: context.requireStudentAuth,
    databaseReady: () => true, sameOrigin: () => true,
    Club: { findOne: () => ({ select: () => query({ id: 1, events: [{ title: 'Future event', date: '2099-01-01', attendanceAudience: 'all_students' }], memberRoster: [] }) }) },
    EventRegistration: { findOne: () => query(null), countDocuments: async () => 0 }
  });
  const server = await new Promise(resolve => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); });
  t.after(() => new Promise(resolve => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}/api/events/1/0/registrations`;
  const response = await fetch(url, { headers: { cookie: 'miu_club=valid-staff' } });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).eligible, true);
  assert.equal((await fetch(url)).status, 401);
});
