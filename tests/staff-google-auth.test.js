const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const express = require('express');
const { STAFF_ROUTES, resolveStaffGoogleAccount, resolveAdminGoogleAccount } = require('../services/staff-google-auth');
const { registerSupervisorAdmin } = require('../services/supervisor-admin');
const query = value => ({ select() { return this; }, read() { return this; }, readConcern() { return this; }, lean: async () => value });

function staffModel(role = 'supervisor') {
  let account = { _id: 'staff-1', email: 'staff@miuegypt.edu.eg', role, assignedClubIds: [12], sessionVersion: 5 };
  let subjectOwner = null;
  let failUpdate = false;
  const model = {
    findOne: filter => query(filter.email ? account : subjectOwner),
    findOneAndUpdate(filter, update) {
      assert.equal(filter._id, account._id); assert.equal(filter.email, account.email);
      assert.equal(filter.role, account.role);
      if (failUpdate) return query(null);
      account = { ...account, ...update.$set }; return query(account);
    }
  };
  return { model, get: () => account, set: value => { account = value; }, owner: value => { subjectOwner = value; }, race: () => { failUpdate = true; } };
}
const identity = { email: 'staff@miuegypt.edu.eg', googleSub: 'verified-subject', name: 'Staff member' };

test('verified staff identity preserves every assigned role, club scope and session version', async () => {
  for (const role of Object.keys(STAFF_ROUTES)) {
    const state = staffModel(role);
    const result = await resolveStaffGoogleAccount(state.model, identity);
    assert.equal(result.account.role, role);
    assert.deepEqual(result.account.assignedClubIds, [12]);
    assert.equal(result.account.sessionVersion, 5);
    assert.equal(result.redirect, STAFF_ROUTES[role]);
    assert.equal(result.account.googleSub, identity.googleSub);
  }
});
test('Google cannot grant a role to an unknown email or replace a bound staff identity', async () => {
  assert.equal(await resolveStaffGoogleAccount({ findOne: () => query(null) }, identity), null);
  const state = staffModel(); state.set({ ...state.get(), googleSub: 'other-subject' });
  await assert.rejects(resolveStaffGoogleAccount(state.model, identity), /STAFF_GOOGLE_ACCOUNT_CONFLICT/);
});

test('custom staff Google sign-in resolves an assigned dashboard and disabled custom grants fall through without staff access', async () => {
  const state = staffModel('custom_review');
  const active = account => ({ ...account, roleAssignments: [{ role: 'custom_review', clubId: 12, assignedClubIds: [12], committee: '' }], customRoles: [{ key: 'custom_review', name: 'Review team', enabled: true }] });
  const result = await resolveStaffGoogleAccount(state.model, identity, async account => active(account));
  assert.equal(result.redirect, '/dashboards/custom-role.html?role=custom_review'); assert.equal(result.account.googleSub, identity.googleSub);
  assert.equal(await resolveStaffGoogleAccount(state.model, identity, async () => null), null);
  state.set({ ...state.get(), googleSub: 'different-subject' });
  await assert.rejects(resolveStaffGoogleAccount(state.model, identity, async account => active(account)), /CONFLICT/);
});
test('subject collisions, unsupported roles and concurrent account changes fail closed', async () => {
  const collision = staffModel(); collision.owner({ _id: 'different-staff' });
  await assert.rejects(resolveStaffGoogleAccount(collision.model, identity), /STAFF_GOOGLE_ACCOUNT_CONFLICT/);
  await assert.rejects(resolveStaffGoogleAccount(staffModel('admin').model, identity), /STAFF_GOOGLE_ACCOUNT_CONFLICT/);
  const raced = staffModel(); raced.race();
  await assert.rejects(resolveStaffGoogleAccount(raced.model, identity), /STAFF_GOOGLE_ACCOUNT_CONFLICT/);
});
test('Google sign-in endpoint verifies the credential before assigning the stored staff role and never creates a student', async () => {
  const source = fs.readFileSync(require.resolve('../server'), 'utf8');
  const start = source.indexOf("app.post('/api/student-auth/google',");
  const end = source.indexOf("app.post('/api/student-auth/google/link'", start);
  let handler; let invalidCredential = false; let createdStudent = 0; let staffCookie = null;
  const context = {
    app: { post: (path, callback) => { handler = callback; } },
    isSameOriginRequest: () => true, checkLoginSourceLock: async () => false, mongoReady: true,
    verifyGoogleRequest: async () => { if (invalidCredential) throw new Error('GOOGLE_ACCOUNT_NOT_ALLOWED'); return identity; },
    getConfiguredAdminEmail: () => null,
    require: () => ({ resolveStaffGoogleAccount }), ClubAccount: staffModel('dean').model,
    StudentAccount: { create: async () => { createdStudent++; } },
    clearLoginSourceFailures: async () => true, recordSuccessfulSignIn: async () => {},
    setClubSessionCookie: (req, res, account) => { staffCookie = account.role; },
    clearGoogleNonceCookie: () => {}, secureCookieSuffix: () => '', countLoginSourceFailure: async () => false,
    console
  };
  vm.createContext(context); vm.runInContext(source.slice(start, end), context);
  let status = 200; let body;
  const res = { setHeader() {}, append() {}, status(code) { status = code; return this; }, json(value) { body = value; } };
  await handler({ body: { credential: 'test-only', role: 'admin' } }, res);
  assert.equal(body.role, 'dean'); assert.equal(body.redirect, STAFF_ROUTES.dean);
  assert.equal(staffCookie, 'dean'); assert.equal(createdStudent, 0);
  invalidCredential = true; staffCookie = null;
  await handler({ body: { credential: 'unverified', role: 'dean' } }, res);
  assert.equal(status, 401); assert.equal(staffCookie, null);
});
test('Google sign-in retries database readiness and fails closed while it is still unavailable', async () => {
  const source = fs.readFileSync(require.resolve('../server'), 'utf8');
  const start = source.indexOf("app.post('/api/student-auth/google',");
  const end = source.indexOf("app.post('/api/student-auth/google/link'", start);
  for (const recovers of [true, false]) {
    let handler, attempts = 0, credentialChecks = 0;
    const context = {
      app: { post: (_path, callback) => { handler = callback; } },
      isSameOriginRequest: () => true, checkLoginSourceLock: async () => false, mongoReady: false,
      ensureReady: async () => { attempts++; context.mongoReady = recovers; },
      verifyGoogleRequest: async () => { credentialChecks++; throw new Error('GOOGLE_ACCOUNT_NOT_ALLOWED'); },
      countLoginSourceFailure: async () => false, console: { error() {} }
    };
    vm.createContext(context); vm.runInContext(source.slice(start, end), context);
    const response = { code: 200, setHeader() {}, status(code) { this.code = code; return this; }, json(body) { this.body = body; } };
    await handler({ body: {} }, response);
    assert.equal(attempts, 1);
    assert.equal(credentialChecks, recovers ? 1 : 0);
    assert.equal(response.code, recovers ? 401 : 503);
  }
});

test('MIU supervisors can be assigned without a portal password; existing passwords cannot be silently replaced', async t => {
  let account = null; let saved;
  const app = express(); app.use(express.json());
  registerSupervisorAdmin(app, {
    ClubAccount: { findOne: async () => account, create: async value => { saved = value; account = value; return { ...value, toObject: () => value }; } },
    StudentAccount: { exists: async () => true }, Club: { countDocuments: async () => 1 },
    databaseReady: () => true, sameOrigin: () => true, refreshAccount: () => {}
  });
  const server = await new Promise(resolve => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); });
  t.after(() => new Promise(resolve => server.close(resolve)));
  const put = body => fetch(`http://127.0.0.1:${server.address().port}/api/admin/supervisors`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  });
  assert.equal((await put({ email: identity.email, assignedClubIds: [12] })).status, 200);
  assert.equal(saved.role, 'supervisor'); assert.equal(saved.passwordHash.length, 128);
  assert.equal(saved.password, undefined);
  account = { _id: 'existing', role: 'supervisor', email: identity.email };
  assert.equal((await put({ email: identity.email, assignedClubIds: [12], password: 'replacement-password' })).status, 400);
});

test('configured MIU administrator signs in through the verified Google endpoint with its existing session version', async () => {
  const source = fs.readFileSync(require.resolve('../server'), 'utf8');
  const start = source.indexOf("app.post('/api/student-auth/google',");
  const end = source.indexOf("app.post('/api/student-auth/google/link'", start);
  let handler; let cookieRole; let body; const cleared = [];
  const account = { _id: 'admin', email: identity.email, sessionVersion: 7, googleSub: identity.googleSub };
  const context = {
    app: { post: (path, callback) => { handler = callback; } }, console,
    isSameOriginRequest: () => true, checkLoginSourceLock: async () => false, mongoReady: true,
    verifyGoogleRequest: async () => identity, getConfiguredAdminEmail: () => identity.email,
    require: () => ({ resolveAdminGoogleAccount }),
    AdminAuthState: { findOne: () => query(account), findOneAndUpdate: () => query(account) },
    clearLoginSourceFailures: async () => true, recordSuccessfulSignIn: async () => {},
    setAdminSessionCookie: () => { cookieRole = 'admin'; }, clearGoogleNonceCookie: () => {}, secureCookieSuffix: () => ''
  };
  vm.createContext(context); vm.runInContext(source.slice(start, end), context);
  const res = { setHeader() {}, append(key, value) { cleared.push(value); }, json(value) { body = value; } };
  await handler({ body: { credential: 'test-only', role: 'head' } }, res);
  assert.equal(cookieRole, 'admin'); assert.equal(body.role, 'admin'); assert.equal(body.redirect, '/admin');
  assert.equal(context.adminAuthState.sessionVersion, 7);
  assert.ok(cleared.some(value => value.startsWith('miu_club=;')));
  assert.ok(cleared.some(value => value.startsWith('miu_student=;')));
});

test('account session prefers student identity and labels software development as staff', async () => {
  const source = fs.readFileSync(require.resolve('../server'), 'utf8');
  const account = { email: identity.email, role: 'software_development' };
  const start = source.indexOf("app.get('/api/site/account-session',");
  const end = source.indexOf("app.get('/api/notifications/config',", start);
  let handler;
  const context = {
    app: { get: (_path, callback) => { handler = callback; } },
    getStudentAccountFromRequest: async () => ({ name: 'Mahmoud', email: identity.email }),
    getClubAccountFromRequest: async () => account,
    getStaffDashboardOptions: () => [{ role: 'software_development' }],
    isAdminSessionValid: async () => false,
    getSoftwareDevelopmentSession: async () => false,
    getConfiguredAdminEmail: () => identity.email,
    ClubAccount: { findOne: () => query(account) }, mongoReady: true, console
  };
  vm.createContext(context);
  vm.runInContext(source.slice(start, end), context);
  let result;
  const res = { setHeader() {}, status() { return this; }, json(value) { result = value; } };
  await handler({}, res);
  assert.equal(result.type, 'student');
  assert.equal(result.name, 'Mahmoud');
  assert.equal(result.hasStudentDashboard, true);
  assert.deepEqual(result.dashboards.map(item => item.role), ['software_development']);
});

test('a club sign-in exposes the student dashboard only when a matching student account exists', async () => {
  const source = fs.readFileSync(require.resolve('../server'), 'utf8');
  const start = source.indexOf("app.get('/api/site/account-session',");
  const end = source.indexOf("app.get('/api/notifications/config',", start);
  let handler;
  const staff = { email: identity.email, role: 'president', clubId: 8, committee: '' };
  const context = {
    app: { get: (_path, callback) => { handler = callback; } },
    getStudentAccountFromRequest: async () => null,
    getClubAccountFromRequest: async () => staff,
    getStaffDashboardOptions: () => [{ role: 'president', clubId: 8 }],
    StudentAccount: { exists: async filter => filter.email === identity.email },
    isAdminSessionValid: async () => false, getConfiguredAdminEmail: () => '',
    ClubAccount: { findOne: () => query(null) }, clubs: [{ id: 8, name: 'MUN' }], mongoReady: true, console
  };
  vm.createContext(context); vm.runInContext(source.slice(start, end), context);
  const response = { setHeader() {}, status() { return this; }, json(value) { this.body = value; } };
  await handler({}, response);
  assert.equal(response.body.type, 'club');
  assert.equal(response.body.hasStudentDashboard, true);
  assert.equal(response.body.clubId, 8);
});

test('dashboard switching can open the linked student dashboard and selects the requested club assignment', async () => {
  const source = fs.readFileSync(require.resolve('../server'), 'utf8');
  const start = source.indexOf("app.post('/api/club-auth/switch-dashboard',");
  const end = source.indexOf("app.post('/api/club-auth/logout',", start);
  const assignments = [
    { role: 'president', clubId: 3, committee: '', href: '/club-dashboard' },
    { role: 'president', clubId: 8, committee: '', href: '/club-dashboard' },
    { role: 'head', clubId: 8, committee: 'IT', href: '/club-dashboard' }
  ];
  const staff = { email: identity.email, role: 'president', clubId: 3 };
  let handler; let studentCookie = false; let clubAssignment = null;
  const context = {
    app: { post: (_path, callback) => { handler = callback; } }, console,
    isSameOriginRequest: () => true, mongoReady: true,
    getClubAccountFromRequest: async () => staff, isAdminSessionValid: async () => false,
    getStaffDashboardOptions: () => assignments,
    StudentAccount: { findOne: () => query({ email: identity.email }) },
    setStudentSessionCookie: () => { studentCookie = true; },
    setClubSessionCookie: (_req, _res, _account, assignment) => { clubAssignment = assignment; }
  };
  vm.createContext(context); vm.runInContext(source.slice(start, end), context);
  const invoke = async body => {
    const response = { code: 200, setHeader() {}, status(code) { this.code = code; return this; }, json(value) { this.body = value; } };
    await handler({ body }, response); return response;
  };
  const student = await invoke({ role: 'student' });
  assert.equal(student.body.redirect, '/?myForms=1'); assert.equal(studentCookie, true);
  const chosen = await invoke({ role: 'president', clubId: 8, committee: '' });
  assert.equal(chosen.body.redirect, '/club-dashboard'); assert.equal(clubAssignment.clubId, 8);
  const rejected = await invoke({ role: 'president', clubId: 99, committee: '' });
  assert.equal(rejected.code, 403);
});
