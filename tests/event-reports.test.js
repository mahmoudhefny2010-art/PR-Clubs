const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { registerEventReports, period, eventsFor, statistics, EventReport } = require('../services/event-reports');
const query = value => ({ select() { return this; }, lean: async () => value });
async function harness(t, overrides = {}) {
  const records = [];
  const club = { id: 1, name: 'Club', events: [
    { requestId: 10, title: 'Opening', date: '2026-02-01', registrationEnabled: true, attendanceEnabled: true },
    { requestId: 11, title: 'Closing', date: '2026-05-31' },
    { requestId: 12, title: 'Outside', date: '2026-06-01' }, { title: 'Undated' }
  ] };
  const deps = {
    databaseReady: () => true, sameOrigin: () => true,
    getAccount: async req => {
      const role = req.headers['x-role'] || 'president';
      return role === 'none' ? null : { role, clubId: 1, assignedClubIds: [1], email: role + '@example.edu' };
    },
    Club: { find: () => query([{ id: 1, name: 'Club' }]), findOne: () => query(club) },
    EventRegistration: { find: () => query([{ eventIndex: 0, eventTitle: 'Opening' }]) },
    AttendanceRecord: { find: () => query([{ eventRequestId: 10, itemType: 'event' }]) },
    Report: {
      find: () => query(records),
      create: async value => {
        if (records.some(r => r.clubId === value.clubId && r.eventKey === value.eventKey)) throw Object.assign(new Error(), { code: 11000 });
        const r = { ...value, updatedAt: new Date() }; records.push(r); return r;
      },
      findOneAndUpdate: async (filter, update) => {
        const r = records.find(r => r.clubId === filter.clubId && r.eventKey === filter.eventKey && r.revision === filter.revision && filter.status.$in.includes(r.status));
        if (!r) return null;
        Object.assign(r, update.$set); r.revision++; r.history.push(update.$push.history); return r;
      }
    }, ...overrides
  };
  const app = express(); app.use(express.json()); registerEventReports(app, deps);
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  t.after(() => new Promise(resolve => server.close(resolve)));
  async function request(path, body, role = 'president') {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/event-reports${path}`, {
      method: body ? 'PUT' : 'GET', headers: { 'x-role': role, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {})
    });
    return { status: response.status, body: await response.json() };
  }
  return { request, records };
}
const payload = { summary: 'Summary', objectives: 'Objectives', activities: 'Activities', outcomes: 'Outcomes', lessonsLearned: 'Lessons', status: 'submitted', revision: 0 };
test('strict real dates and ordered explicit boundaries', () => {
  assert.equal(period('2026-02-01', '2026-05-31'), true);
  for (const [s, e] of [['2026-02-30', '2026-05-31'], ['', ''], ['2026-05-31', '2026-02-01'], ['2026-2-01', '2026-05-31']]) assert.equal(period(s, e), false);
});
test('inclusive semester filtering, separate totals, missing data and empty semesters', async t => {
  const { request } = await harness(t);
  const { body } = await request('/clubs/1?start=2026-02-01&end=2026-05-31');
  assert.equal(body.events.length, 2); assert.equal(body.undatedEvents, 1);
  assert.deepEqual(body.overview, { events: 2, reported: 0, registered: 1, verified: 1, missingRegistration: 1, missingAttendance: 1 });
  assert.equal(body.events[1].statistics.verified, null);
  assert.equal((await request('/clubs/1?start=2025-01-01&end=2025-01-31')).body.overview.events, 0);
  assert.equal((await request('/clubs/1')).status, 400);
});
test('existing event identities, legacy collisions and statistics matching', () => {
  const a = eventsFor({ events: [{ title: 'A', date: '2026-02-01' }] })[0];
  const b = eventsFor({ events: [{ title: 'Replacement', date: '2026-02-01' }] })[0];
  assert.notEqual(a.key, b.key);
  assert.deepEqual(statistics(a, [{ eventIndex: 0, eventTitle: 'Replacement' }], [{ eventRequestId: -1, eventTitle: 'Replacement', eventDate: a.date }]).verified, null);
  assert.ok(EventReport.schema.indexes().some(([keys, options]) => keys.clubId && keys.eventKey && options.unique));
});
test('submission, duplicates, locks, assigned review, resubmission and stale revision', async t => {
  const { request, records } = await harness(t);
  const path = '/clubs/1/events/request:10';
  assert.equal((await request(path, payload)).status, 200);
  assert.ok(records[0].submittedAt);
  assert.equal((await request(path, payload)).status, 409);
  assert.equal((await request(path, { ...payload, revision: 1 })).status, 409);
  assert.equal((await request(path, { revision: 1, status: 'changes_requested', note: 'Please clarify outcomes' }, 'supervisor')).status, 200);
  assert.equal((await request(path, { ...payload, revision: 1 })).status, 409);
  assert.equal((await request(path, { ...payload, revision: 2, status: 'draft' })).status, 200);
  assert.equal((await request(path, { ...payload, revision: 3 })).status, 200);
  assert.equal((await request(path, { revision: 4, status: 'reviewed', note: 'Reviewed' }, 'supervisor')).status, 200);
  assert.equal((await request(path, { ...payload, revision: 5 })).status, 409);
  assert.equal(records[0].history.length, 5);
});
test('authorization, cross-club writes, role escalation and backend validation', async t => {
  const { request, records } = await harness(t);
  assert.equal((await request('/clubs', null, 'none')).status, 401);
  for (const role of ['head', 'dean', 'student']) assert.equal((await request('/clubs', null, role)).status, 403);
  for (const role of ['president', 'supervisor']) assert.equal((await request('/clubs/2/events/request:10', payload, role)).status, 403);
  assert.equal((await request('/clubs/1/events/request:999', payload)).status, 404);
  for (const body of [{ ...payload, summary: '' }, { ...payload, activities: [] }, { ...payload, revision: -1 }, { ...payload, summary: 'x'.repeat(5001) }, { ...payload, status: 'reviewed' }]) assert.equal((await request('/clubs/1/events/request:10', body)).status, 400);
  assert.equal(records.length, 0);
});
test('database readiness, read and write failures and cross-origin writes', async t => {
  const offline = await harness(t, { databaseReady: () => false });
  assert.equal((await offline.request('/clubs')).status, 503);
  const broken = await harness(t, { Club: { findOne() { throw new Error('DB_DOWN'); } } });
  assert.equal((await broken.request('/clubs/1?start=2026-01-01&end=2026-12-31')).status, 503);
  assert.equal((await broken.request('/clubs/1/events/request:10', payload)).status, 503);
  const write = await harness(t, { Report: { create() { throw new Error('DB_DOWN'); } } });
  assert.equal((await write.request('/clubs/1/events/request:10', payload)).status, 503);
  const origin = await harness(t, { sameOrigin: () => false });
  assert.equal((await origin.request('/clubs/1/events/request:10', payload)).status, 403);
});
