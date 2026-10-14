const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { registerStudentEvents, eventRules } = require('../services/student-event-registration');
async function harness(t, options = {}) {
  const registrations = [], event = { title: 'Open campus event', date: '2099-10-15', registrationEnabled: true, requestId: 99, ...options.event };
  let queue = Promise.resolve();
  const query = value => ({ select() { return this; }, session() { return this; }, lean: async () => value, then: (resolve, reject) => Promise.resolve(value).then(resolve, reject) });
  const app = express(); app.use(express.json());
  registerStudentEvents(app, {
    requireStudentAuth: (req, res, next) => {
      if (req.headers['x-student'] === 'none') return res.status(401).json({ message: 'Sign in' });
      req.studentAccount = { _id: req.headers['x-student'] || 'student1', name: 'Authenticated Student', email: (req.headers['x-student'] || 'student1') + '@miuegypt.edu.eg' }; next();
    }, sameOrigin: () => options.origin !== false, databaseReady: () => options.ready !== false,
    mongoose: { startSession: async () => ({ endSession: async () => {}, withTransaction: async action => {
      const previous = queue; let release; queue = new Promise(resolve => release = resolve); await previous;
      try { await action(); } finally { release(); }
    } }) },
    Club: { updateOne: async () => {}, findOne() { if (options.failure) throw new Error('DB_DOWN'); return query(options.missing ? null : { events: [event], memberRoster: options.roster || [] }); } },
    Application: { exists: async filter => (options.acceptedMembers || []).includes(filter.email) },
    EventRegistration: {
      findOne: filter => query(registrations.find(r => r.email === filter.email) || null),
      countDocuments: () => query(registrations.length),
      create: async ([value]) => { if (options.writeFailure) throw new Error('DB_DOWN'); registrations.push({ ...value, _id: String(registrations.length + 1) }); },
      deleteOne: async filter => { const i = registrations.findIndex(r => r._id === filter._id && r.email === filter.email); if (i >= 0) registrations.splice(i, 1); }
    }
  });
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); }); t.after(() => new Promise(resolve => server.close(resolve)));
  const request = async (method = 'POST', student = 'student1', path = '/1/0', body = {}) => {
    const r = await fetch(`http://127.0.0.1:${server.address().port}/api/events${path}/registrations`, { method, headers: { 'x-student': student, 'Content-Type': 'application/json' }, ...(method === 'GET' ? {} : { body: JSON.stringify(body) }) });
    return { status: r.status, data: await r.json() };
  };
  return { request, registrations };
}
test('members and non-members register with authenticated identity, never submitted identity', async t => {
  const f = await harness(t);
  assert.equal((await f.request('POST', 'nonmember', '/1/0', { name: 'Forged', email: 'victim@example.edu', studentAccountId: 'victim' })).status, 201);
  assert.equal((await f.request('POST', 'member')).status, 201);
  assert.equal(f.registrations[0].name, 'Authenticated Student'); assert.equal(f.registrations[0].email, 'nonmember@miuegypt.edu.eg');
  assert.equal(f.registrations[0].studentAccountId, 'nonmember');
});
test('repeated requests are idempotent and status persists', async t => {
  const f = await harness(t); await f.request(); const repeat = await f.request();
  assert.equal(repeat.status, 200); assert.equal(repeat.data.alreadyRegistered, true); assert.equal(f.registrations.length, 1);
  assert.equal((await f.request('GET')).data.registered, true);
});
test('capacity checks serialize concurrent registrations', async t => {
  const f = await harness(t, { event: { capacity: 1 } });
  const results = await Promise.all([f.request('POST', 'first'), f.request('POST', 'second')]);
  assert.deepEqual(results.map(r => r.status).sort(), [201, 409]); assert.equal(f.registrations.length, 1);
  assert.equal((await f.request('GET', 'second')).data.eligible, false);
});
test('members-only events accept roster or accepted-application members and reject non-members', async t => {
  const f = await harness(t, { event: { attendanceAudience: 'members' }, roster: [{ email: 'roster@miuegypt.edu.eg' }], acceptedMembers: ['application@miuegypt.edu.eg'] });
  assert.equal((await f.request('GET', 'outsider')).data.eligible, false);
  assert.match((await f.request('GET', 'outsider')).data.message, /limited to current members/);
  assert.equal((await f.request('POST', 'outsider')).status, 403);
  assert.equal((await f.request('POST', 'roster')).status, 201);
  assert.equal((await f.request('POST', 'application')).status, 201);
  assert.equal(f.registrations.length, 2);
});
test('anonymous, invalid identifiers, missing events and cross-origin writes are denied', async t => {
  const f = await harness(t); assert.equal((await f.request('POST', 'none')).status, 401);
  for (const path of ['/1e0/0', '/1/-1', '/0/0', '/1/no']) assert.equal((await f.request('POST', 'student1', path)).status, 400);
  const missing = await harness(t, { missing: true }); assert.equal((await missing.request()).status, 404);
  const origin = await harness(t, { origin: false }); assert.equal((await origin.request()).status, 403);
});
test('expired, disabled, cancelled, invalid dates and passed deadlines reject registration', async t => {
  for (const event of [{ date: '2000-01-01' }, { registrationEnabled: false }, { cancelled: true }, { status: 'pending_pr' }, { date: '2099-02-30' }, { registrationDeadline: '2000-01-01T00:00:00Z' }, { capacity: 0 }]) {
    const f = await harness(t, { event }); assert.equal((await f.request()).status, 409); assert.equal(f.registrations.length, 0);
  }
  assert.match(eventRules({ date: '2026-10-13', time: '09:00' }, new Date('2026-10-13T12:00:00Z')), /started/);
});
test('cancellation is scoped to current student and only enabled by explicit event rules', async t => {
  const f = await harness(t, { event: { cancellationEnabled: true } }); await f.request();
  assert.equal((await f.request('DELETE', 'other')).data.registered, false); assert.equal(f.registrations.length, 1);
  assert.equal((await f.request('GET')).data.cancellationAllowed, true); assert.equal((await f.request('DELETE')).status, 200); assert.equal(f.registrations.length, 0);
  const locked = await harness(t); await locked.request(); assert.equal((await locked.request('DELETE')).status, 409);
});
test('database unavailability and query/write failures do not report success', async t => {
  for (const options of [{ ready: false }, { failure: true }, { writeFailure: true }]) {
    const f = await harness(t, options); assert.equal((await f.request()).status, 503); assert.equal(f.registrations.length, 0);
  }
});
