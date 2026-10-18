const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { assignedIds, registerSupervisorDashboard } = require('../services/supervisor-dashboard');
const { registerSupervisorAdmin } = require('../services/supervisor-admin');

function query(value) { return { select() { return this; }, sort() { return this; }, read() { return this; }, lean: async () => value }; }
async function harness(t, overrides = {}) {
  const filters = []; const writes = [];
  const account = { _id: 'abc', email: 'doctor@example.edu', role: 'supervisor', assignedClubIds: [1] };
  const app = express(); app.use(express.json());
  const deps = {
    getAccount: async req => req.headers['x-account'] === 'none' ? null : req.headers['x-account'] === 'president' ? { role: 'president' } : account,
    databaseReady: () => true, sameOrigin: () => true,
    Club: { find: filter => { filters.push(filter); return query([{ id: 1, name: 'Assigned' }]); }, findOne: filter => { filters.push(filter); return query({ id: 1, name: 'Assigned', events: [{ title: 'Event', attendeeEmail: 'private' }] }); } },
    ContentRequest: { aggregate: async pipeline => { filters.push(pipeline[0].$match); return []; }, find: filter => { filters.push(filter); return query([]); }, exists: async filter => { filters.push(filter); return filter.clubId === 1 && filter.id === 2; } },
    SpeakerRequest: { find: filter => { filters.push(filter); return query([]); }, exists: async filter => { filters.push(filter); return false; } },
    AttendanceRecord: { aggregate: async filter => { filters.push(filter[0].$match); return []; } },
    EventRegistration: { find: filter => { filters.push(filter); return query([
      { eventIndex: 0, eventTitle: 'Event', name: 'Student One', email: 'student@example.edu', createdAt: new Date('2026-10-18T08:00:00Z') },
      { eventIndex: 0, eventTitle: 'Renamed event', name: 'Stale record', email: 'stale@example.edu' },
      { eventIndex: 3, eventTitle: 'Event', name: 'Different event', email: 'other@example.edu' }
    ]); } },
    Review: { find: filter => { filters.push(filter); return query([]); }, findOneAndUpdate: async (filter, update) => { writes.push(filter); return { note: update.$set.note, updatedAt: new Date() }; } },
    publicSpeakerRequest: value => value,
    ...overrides
  };
  registerSupervisorDashboard(app, deps);
  const server = await new Promise(resolve => { const server = app.listen(0, '127.0.0.1', () => resolve(server)); });
  t.after(() => new Promise(resolve => server.close(resolve)));
  const request = async (path, options = {}) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/supervisor${path}`, options);
    return { status: response.status, body: response.headers.get('content-type')?.includes('application/json') ? await response.json() : await response.text() };
  };
  return { request, filters, writes, account };
}
test('assignment scope rejects implicit ownership and malformed assignment IDs', () => {
  assert.deepEqual(assignedIds({ role: 'supervisor', clubId: 8, assignedClubIds: [1, 1, '2', -1] }), [1]);
  assert.deepEqual(assignedIds({ role: 'president', assignedClubIds: [1] }), []);
  assert.deepEqual(assignedIds({ role: 'supervisor', clubId: 8 }), []);
});
test('assigned supervisor reads scoped data without attendee personal information', async t => {
  const { request, filters } = await harness(t);
  assert.equal((await request('/clubs')).status, 200);
  assert.deepEqual(filters.shift(), { id: { $in: [1] } });
  const result = await request('/clubs/1');
  assert.equal(result.status, 200);
  assert.equal(result.body.club.events[0].attendeeEmail, undefined);
  assert.ok(filters.every(filter => filter.clubId === 1 || filter.id === 1));
});
test('assigned supervisor can view registrations grouped only under current assigned-club events', async t => {
  const { request, filters } = await harness(t);
  const result = await request('/clubs/1/registrations');
  assert.equal(result.status, 200);
  assert.deepEqual(result.body.events, [{ title: 'Event', date: '', time: '', location: '', registrations: [
    { name: 'Student One', email: 'student@example.edu', registeredAt: '2026-10-18T08:00:00.000Z' }
  ] }]);
  assert.deepEqual(filters.find(filter => filter && filter.clubId === 1), { clubId: 1 });
});
test('anonymous, other roles, unassigned URLs and malformed IDs are denied before lookup', async t => {
  const { request, filters } = await harness(t);
  assert.equal((await request('/clubs', { headers: { 'x-account': 'none' } })).status, 401);
  assert.equal((await request('/clubs', { headers: { 'x-account': 'president' } })).status, 403);
  for (const path of ['/clubs/2', '/clubs/2/registrations', '/clubs/1e0', '/clubs/-1']) assert.equal((await request(path)).status, 404);
  assert.equal(filters.length, 0);
});
test('review writes enforce both assigned club and request ownership; do not change workflow status', async t => {
  const { request, writes, filters } = await harness(t);
  const options = { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ note: 'Please consider student accessibility.' }) };
  assert.equal((await request('/clubs/2/reviews/content/2', options)).status, 404);
  assert.equal((await request('/clubs/1/reviews/content/999', options)).status, 404);
  assert.equal((await request('/clubs/1/reviews/content/2', options)).status, 200);
  assert.deepEqual(writes, [{ clubId: 1, supervisorId: 'abc', targetType: 'content', targetId: '2' }]);
  assert.deepEqual(filters.slice(-2), [{ id: 999, clubId: 1 }, { id: 2, clubId: 1 }]);
  assert.equal((await request('/clubs/1/reviews/content/2', { ...options, body: '{"note":" "}' })).status, 400);
  assert.equal((await request('/clubs/1/reviews/content/2', { ...options, method: 'DELETE' })).status, 404);
});
test('missing assignments return an empty dashboard; connection and query failures return 503', async t => {
  const empty = await harness(t, { getAccount: async () => ({ role: 'supervisor', assignedClubIds: [] }), Club: { find: () => query([]) } });
  assert.deepEqual((await empty.request('/clubs')).body, { clubs: [] });
  assert.equal((await empty.request('/clubs/1')).status, 404);
  const unavailable = await harness(t, { databaseReady: () => false });
  assert.equal((await unavailable.request('/clubs')).status, 503);
  const failed = await harness(t, { Club: { find: () => { throw new Error('DB_DOWN'); } } });
  assert.equal((await failed.request('/clubs')).status, 503);
});
test('cross-origin review writes are rejected', async t => {
  const { request, writes } = await harness(t, { sameOrigin: () => false });
  const result = await request('/clubs/1/reviews/content/2', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: '{"note":"Hi"}' });
  assert.equal(result.status, 403); assert.equal(writes.length, 0);
});

test('admin assignments require existing clubs, preserve other roles and revoke sessions', async t => {
  const app = express(); app.use(express.json());
  app.use('/api/admin', (req, res, next) => req.headers['x-admin'] === 'yes' ? next() : res.status(403).json({ message: 'Admin required' }));
  const updates = [];
  let existing = { _id: 'doctor', email: 'doctor@example.edu', role: 'supervisor' };
  registerSupervisorAdmin(app, {
    ClubAccount: { findOne: async () => existing, findOneAndUpdate: async (filter, update) => {
      updates.push({ filter, update });
      existing = { ...existing, ...update.$set, sessionVersion: (existing.sessionVersion || 0) + 1 };
      return { ...existing, toObject: () => existing };
    } },
    StudentAccount: { exists: async () => false },
    Club: { countDocuments: async ({ id }) => id.$in.filter(value => value === 1).length },
    databaseReady: () => true, sameOrigin: () => true, refreshAccount: () => {}
  });
  const server = await new Promise(resolve => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); });
  t.after(() => new Promise(resolve => server.close(resolve)));
  const request = (ids, admin = 'yes') => fetch(`http://127.0.0.1:${server.address().port}/api/admin/supervisors`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json', 'x-admin': admin },
    body: JSON.stringify({ email: 'doctor@example.edu', assignedClubIds: ids })
  });
  assert.equal((await request([1], 'no')).status, 403);
  assert.equal((await request([])).status, 400);
  assert.equal(updates.length, 0);
  assert.equal((await request([2])).status, 400);
  assert.equal((await request([1, 1])).status, 400);
  const saved = await request([1]);
  assert.equal(saved.status, 200); assert.equal((await saved.json()).savedToDatabase, true);
  assert.equal(updates[0].update.$inc.sessionVersion, 1);
  assert.deepEqual(updates[0].update.$set.assignedClubIds, [1]);
  existing = { ...existing, role: 'dean', roleAssignments: [{ role: 'dean', clubId: 0, assignedClubIds: [], committee: '' }] };
  const savedAgain = await request([1]);
  assert.equal(savedAgain.status, 200); assert.equal((await savedAgain.json()).savedToDatabase, true);
  assert.deepEqual(updates[1].update.$set.roleAssignments.map(item => item.role), ['dean', 'supervisor']);
  assert.equal(updates.length, 2);
});

test('real session validation accepts signed supervisor accounts on another instance and rejects revoked sessions', async () => {
  const fs = require('node:fs'); const vm = require('node:vm'); const crypto = require('node:crypto');
  const source = fs.readFileSync(require.resolve('../server'), 'utf8');
  const start = source.indexOf('function createClubSession(account');
  const end = source.indexOf('function setClubSessionCookie', start);
  let account = { _id: 'doctor', clubId: 1, email: 'doctor@example.edu', role: 'supervisor', sessionVersion: 2, assignedClubIds: [1] };
  const context = { crypto, Buffer, Date, mongoReady: true, sessionSecret: 'unit-test-only', clubAccounts: [],
    require: name => name === './services/staff-google-auth' ? require('../services/staff-google-auth') : require(name),
    ClubAccount: { findOne: () => query(account) } };
  vm.createContext(context); vm.runInContext(source.slice(start, end), context);
  const payload = `1.${Buffer.from(account.email).toString('base64url')}.${Date.now() + 10000}.2`;
  const cookie = `${payload}.${crypto.createHmac('sha256', context.sessionSecret).update(payload).digest('hex')}`;
  assert.equal((await context.getClubAccountFromRequest({ headers: { cookie: `miu_club=${cookie}` } })).role, 'supervisor');
  account = { ...account, sessionVersion: 3 };
  assert.equal(await context.getClubAccountFromRequest({ headers: { cookie: `miu_club=${cookie}` } }), null);
  assert.equal(await context.getClubAccountFromRequest({ headers: { cookie: `miu_club=${cookie.slice(0, -1)}x` } }), null);
});

test('signed dashboard choice grants only the saved role and its exact scope', async () => {
  const fs = require('node:fs'); const vm = require('node:vm'); const crypto = require('node:crypto');
  const source = fs.readFileSync(require.resolve('../server'), 'utf8');
  const start = source.indexOf('function createClubSession(account');
  const end = source.indexOf('function setClubSessionCookie', start);
  const account = { _id: 'multi', clubId: 1, email: 'staff@miuegypt.edu.eg', role: 'president', sessionVersion: 4,
    roleAssignments: [
      { role: 'president', clubId: 1, assignedClubIds: [], committee: '' },
      { role: 'supervisor', clubId: 0, assignedClubIds: [1, 2], committee: '' },
      { role: 'dean', clubId: 0, assignedClubIds: [], committee: '' }
    ] };
  const context = { crypto, Buffer, Date, mongoReady: true, sessionSecret: 'unit-test-only', clubAccounts: [],
    require: name => name === './services/staff-google-auth' ? require('../services/staff-google-auth') : require(name),
    ClubAccount: { findOne: () => query(account) } };
  vm.createContext(context); vm.runInContext(source.slice(start, end), context);
  const signedCookie = (clubId, role) => context.createClubSession(account, { role, clubId });
  const supervisor = await context.getClubAccountFromRequest({ headers: { cookie: `miu_club=${signedCookie(0, 'supervisor')}` } });
  assert.equal(supervisor.role, 'supervisor'); assert.deepEqual(supervisor.assignedClubIds, [1, 2]);
  assert.equal(await context.getClubAccountFromRequest({ headers: { cookie: `miu_club=${signedCookie(0, 'security')}` } }), null);
  assert.equal(await context.getClubAccountFromRequest({ headers: { cookie: `miu_club=${signedCookie(7, 'supervisor')}` } }), null);
});

test('existing club middleware denies supervisor access but preserves president access', async () => {
  const fs = require('node:fs'); const vm = require('node:vm');
  const source = fs.readFileSync(require.resolve('../server'), 'utf8');
  const start = source.indexOf('async function requireClubAuth(req, res, next)');
  const end = source.indexOf('function createStudentSession', start);
  let role = 'supervisor'; let status; let nextCalls = 0;
  const context = { getClubAccountFromRequest: async () => ({ role }), console };
  vm.createContext(context); vm.runInContext(source.slice(start, end), context);
  const res = { status(code) { status = code; return this; }, json() {} };
  await context.requireClubAuth({}, res, () => nextCalls++);
  assert.equal(status, 403); assert.equal(nextCalls, 0);
  role = 'president'; await context.requireClubAuth({}, res, () => nextCalls++);
  assert.equal(nextCalls, 1);
});

test('private speaker downloads verify current club assignments before issuing signed URLs', async () => {
  const fs = require('node:fs'); const vm = require('node:vm');
  const source = fs.readFileSync(require.resolve('../server'), 'utf8');
  const start = source.indexOf("app.get('/api/speaker-requests/:id/cv'");
  const end = source.indexOf("app.get('/api/dean/speaker-requests'", start);
  let handler; let clubId = 2; let signed = 0; let status; let body;
  const context = {
    app: { get: (path, callback) => { handler = callback; } },
    require: () => ({ assignedIds }),
    requireLiveDatabase: () => true, cloudinaryConfigured: true,
    getSpeakerRequester: async () => null,
    getClubAccountFromRequest: async () => ({ role: 'supervisor', assignedClubIds: [1] }),
    mongoose: { isValidObjectId: () => true },
    SpeakerRequest: { findById: () => query({ clubId, cvPublicId: 'private/material', cvFormat: 'pdf' }) },
    cloudinary: { utils: { private_download_url: () => { signed++; return 'https://example.test/signed'; } } },
    console
  };
  vm.createContext(context); vm.runInContext(source.slice(start, end), context);
  const res = { status(code) { status = code; return this; }, json(value) { body = value; } };
  await handler({ params: { id: 'a'.repeat(24) }, query: {} }, res);
  assert.equal(status, 403); assert.equal(signed, 0);
  clubId = 1; status = 200;
  await handler({ params: { id: 'a'.repeat(24) }, query: {} }, res);
  assert.equal(status, 200); assert.equal(body.url, 'https://example.test/signed'); assert.equal(signed, 1);
});

test('supervisor deletion is admin-only, role-scoped and preserves review records', async t => {
  const app = express(); app.use(express.json());
  app.use('/api/admin', (req, res, next) => req.headers['x-admin'] === 'yes' ? next() : res.status(403).json({ message: 'Admin required' }));
  let account = { _id: 'doctor-id', email: 'doctor@example.edu', role: 'supervisor', sessionVersion: 2, clubId: 1, assignedClubIds: [1],
    roleAssignments: [{ role: 'supervisor', clubId: 1, assignedClubIds: [1], committee: '' }, { role: 'dean', clubId: 0, assignedClubIds: [], committee: '' }] };
  let failed = false; const filters = []; const removed = []; const refreshed = [];
  registerSupervisorAdmin(app, {
    ClubAccount: {
      findOne: filter => ({ lean: async () => { if (failed) throw new Error('DB_DOWN'); return account?.email === filter.email ? account : null; } }),
      findOneAndUpdate: (filter, update) => ({ lean: async () => {
        filters.push(filter); if (!account || String(filter._id) !== account._id) return null;
        account = { ...account, ...update.$set, sessionVersion: account.sessionVersion + 1 }; return account;
      } }),
      async findOneAndDelete(filter) { filters.push(filter); if (!account || String(filter._id) !== account._id) return null; const old = account; account = null; return old; }
    },
    databaseReady: () => true, sameOrigin: req => req.headers['x-origin'] !== 'invalid',
    isAdminEmail: email => email === 'admin@example.edu', removeAccount: email => removed.push(email), refreshAccount: value => refreshed.push(value)
  });
  const server = await new Promise(resolve => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); });
  t.after(() => new Promise(resolve => server.close(resolve)));
  const request = (email, headers = {}) => fetch(`http://127.0.0.1:${server.address().port}/api/admin/supervisors`, {
    method: 'DELETE', headers: { 'Content-Type': 'application/json', 'x-admin': 'yes', ...headers }, body: JSON.stringify({ email })
  });
  assert.equal((await request('doctor@example.edu', { 'x-admin': 'no' })).status, 403);
  assert.equal((await request('doctor@example.edu', { 'x-origin': 'invalid' })).status, 403);
  assert.equal((await request('admin@example.edu')).status, 403);
  assert.equal(filters.length, 0);
  const removal = await request('doctor@example.edu');
  assert.equal(removal.status, 200);
  const removalResult = await removal.json();
  assert.equal(removalResult.savedToDatabase, true); assert.equal(removalResult.accountDeleted, false);
  assert.equal(account.role, 'dean'); assert.deepEqual(account.roleAssignments.map(item => item.role), ['dean']);
  assert.deepEqual(removed, []); assert.equal(refreshed.length, 1);
  assert.equal((await request('doctor@example.edu')).status, 404);
  failed = true; assert.equal((await request('doctor@example.edu')).status, 503);
});
