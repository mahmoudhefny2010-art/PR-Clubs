const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { validateStaffAssignment, validateStaffAssignments, registerStaffAccountAdmin } = require('../services/staff-account-admin');
const { STAFF_ROUTES, resolveAdminGoogleAccount } = require('../services/staff-google-auth');
const query = value => ({ select() { return this; }, sort() { return this; }, read() { return this; }, readConcern() { return this; }, lean: async () => value });
const base = { email: 'staff@miuegypt.edu.eg', role: 'supervisor', assignedClubIds: [1] };

test('all staff roles validate their own club/committee scope and reject privileged role injection', () => {
  for (const role of Object.keys(STAFF_ROUTES)) {
    const scoped = ['president', 'head', 'supervisor'].includes(role);
    const result = validateStaffAssignment({ ...base, role, assignedClubIds: scoped ? [1] : [], committee: 'IT' });
    assert.equal(result.error, undefined);
    assert.equal(result.value.clubId, scoped ? 1 : 0);
  }
  for (const role of ['admin', 'student', '__proto__', 'constructor']) assert.ok(validateStaffAssignment({ ...base, role }).error);
  assert.ok(validateStaffAssignment({ ...base, assignedClubIds: [] }).error);
  assert.ok(validateStaffAssignment({ ...base, role: 'head', committee: '' }).error);
  assert.ok(validateStaffAssignment({ ...base, role: 'president', assignedClubIds: [1, 2] }).error);
  assert.ok(validateStaffAssignment({ ...base, role: 'dean' }).error);
  assert.ok(validateStaffAssignment({ ...base, email: 'outside@example.com' }).error);
  assert.ok(validateStaffAssignment({ ...base, assignedClubIds: ['1'] }).error);
});

test('one MIU account can have distinct, correctly scoped dashboard roles', () => {
  const result = validateStaffAssignments({ email: base.email, assignments: [
    { role: 'supervisor', assignedClubIds: [1] },
    { role: 'head', assignedClubIds: [1], committee: 'IT' },
    { role: 'dean', assignedClubIds: [] },
    { role: 'software_development', assignedClubIds: [] }
  ] });
  assert.equal(result.error, undefined);
  assert.deepEqual(result.value.roleAssignments.map(item => item.role), ['supervisor', 'head', 'dean', 'software_development']);
  assert.equal(result.value.roleAssignments[1].committee, 'IT');
  assert.ok(validateStaffAssignments({ email: base.email, assignments: [
    { role: 'dean', assignedClubIds: [] }, { role: 'dean', assignedClubIds: [] }
  ] }).error);
  assert.ok(validateStaffAssignments({ email: base.email, assignments: [] }).error);
});

async function fixture(t) {
  let account = null; let fail = false; let raced = false; let saved; let failReadback = false; let writeOptions;
  const writes = [];
  const app = express(); app.use(express.json());
  app.use('/api/admin', (req, res, next) => req.headers['x-test-admin'] === 'yes' ? next() : res.status(403).json({ message: 'Admin required' }));
  registerStaffAccountAdmin(app, {
    ClubAccount: {
      find: () => query(account ? [account] : []),
      findOne: () => { if (fail) throw new Error('DB_DOWN'); return query(failReadback ? null : account); },
      create: async (value, options) => { writes.push(value); writeOptions = options; account = { ...value, _id: 'created' }; saved = account; return { toObject: () => account }; },
      findOneAndUpdate: (filter, update) => {
        writes.push({ filter, update });
        if (raced) return query(null);
        account = { ...account, ...update.$set, sessionVersion: account.sessionVersion + 1 };
        saved = account;
        return query(account);
      }
    },
    Club: { find: () => query([{ id: 1, name: 'Assigned club' }]), countDocuments: async filter => filter.id.$in.filter(id => id === 1).length },
    databaseReady: () => true, sameOrigin: req => req.headers['x-test-origin'] !== 'invalid',
    isAdminEmail: email => email === 'admin@miuegypt.edu.eg', refreshAccount: () => {}
  });
  const server = await new Promise(resolve => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); });
  t.after(() => new Promise(resolve => server.close(resolve)));
  const request = async (body, headers = {}, method = 'PUT') => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/admin/staff-accounts`, {
      method, headers: { 'Content-Type': 'application/json', 'x-test-admin': 'yes', ...headers }, ...(method === 'PUT' ? { body: JSON.stringify(body) } : {})
    });
    return { status: response.status, body: await response.json() };
  };
  return { request, writes, saved: () => saved, writeOptions: () => writeOptions, set: value => { account = value; }, fail: () => { fail = true; }, race: () => { raced = true; }, failReadback: () => { failReadback = true; } };
}
test('only admin can assign roles, with same-origin and protected global-admin checks', async t => {
  const state = await fixture(t);
  assert.equal((await state.request(base, { 'x-test-admin': 'no' })).status, 403);
  assert.equal((await state.request(base, { 'x-test-origin': 'invalid' })).status, 403);
  assert.equal((await state.request({ ...base, email: 'admin@miuegypt.edu.eg' })).status, 409);
  assert.equal(state.writes.length, 0);
});
test('Google-only staff creation saves a hashed secret and validates clubs without returning credentials', async t => {
  const state = await fixture(t);
  assert.equal((await state.request({ ...base, assignedClubIds: [999] })).status, 400);
  const result = await state.request(base);
  assert.equal(result.status, 200);
  assert.equal(result.body.savedToDatabase, true);
  assert.deepEqual(state.writeOptions(), { writeConcern: { w: 'majority' } });
  assert.equal(state.saved().role, 'supervisor'); assert.equal(state.saved().passwordHash.length, 128);
  assert.deepEqual(state.saved().roleAssignments.map(item => item.role), ['supervisor']);
  assert.equal(result.body.passwordHash, undefined); assert.equal(result.body.salt, undefined);
});
test('staff account API persists multiple dashboard assignments under one Google email', async t => {
  const state = await fixture(t);
  const result = await state.request({ email: base.email, assignments: [
    { role: 'supervisor', assignedClubIds: [1] },
    { role: 'head', assignedClubIds: [1], committee: 'IT' },
    { role: 'dean', assignedClubIds: [] }
  ] });
  assert.equal(result.status, 200);
  assert.equal(result.body.savedToDatabase, true);
  assert.deepEqual(state.saved().roleAssignments.map(item => item.role), ['supervisor', 'head', 'dean']);
  assert.deepEqual(result.body.assignments.map(item => item.role), ['supervisor', 'head', 'dean']);
  assert.equal(result.body.role, 'supervisor');
});
test('changing a role revokes old sessions and preserves the linked Google identity and password', async t => {
  const state = await fixture(t);
  state.set({ _id: 'existing', email: base.email, role: 'supervisor', sessionVersion: 8,
    googleSub: 'verified-subject', passwordHash: 'existing-hash', salt: 'existing-salt', assignedClubIds: [1] });
  const result = await state.request({ ...base, role: 'pr', assignedClubIds: [] });
  assert.equal(result.status, 200); assert.equal(result.body.savedToDatabase, true); assert.equal(result.body.role, 'pr');
  assert.equal(state.writes[0].update.$inc.sessionVersion, 1);
  assert.equal(state.writes[0].update.$set.googleSub, undefined);
  assert.equal(state.writes[0].update.$set.passwordHash, undefined);
  assert.equal(state.writes[0].filter.sessionVersion, 8);
  state.race(); assert.equal((await state.request(base)).status, 409);
});
test('database failures never report successful role assignment', async t => {
  const state = await fixture(t); state.fail();
  assert.equal((await state.request(base)).status, 503); assert.equal(state.writes.length, 0);
});
test('a write without a matching majority readback never reports success', async t => {
  const state = await fixture(t); state.failReadback();
  const result = await state.request(base);
  assert.equal(result.status, 503);
  assert.notEqual(result.body.savedToDatabase, true);
});
test('global admin Google access requires the exact configured email and cannot replace a subject', async () => {
  const admin = { _id: 'admin', email: 'admin@miuegypt.edu.eg', sessionVersion: 4, passwordHash: 'kept' };
  let writes = 0;
  const model = { findOne: () => query(admin), findOneAndUpdate: (filter, update) => { writes++; return query({ ...admin, ...update.$set }); } };
  const params = { AdminAuthState: model, identity: { email: 'staff@miuegypt.edu.eg', googleSub: 'subject' }, configuredEmail: admin.email };
  assert.equal(await resolveAdminGoogleAccount(params), null); assert.equal(writes, 0);
  const saved = await resolveAdminGoogleAccount({ ...params, identity: { email: admin.email, googleSub: 'subject' } });
  assert.equal(saved.sessionVersion, 4); assert.equal(saved.passwordHash, 'kept');
  admin.googleSub = 'existing-subject';
  await assert.rejects(resolveAdminGoogleAccount({ ...params, identity: { email: admin.email, googleSub: 'other' } }), /STAFF_GOOGLE_ACCOUNT_CONFLICT/);
});
