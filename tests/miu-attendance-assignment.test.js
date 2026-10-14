const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const vm = require('node:vm');
const fs = require('node:fs');

async function fixture(t) {
  const sessions = [];
  let nextId = 0;
  let updateManyCalls = 0;
  const query = value => ({ select() { return this; }, lean: async () => value });
  const app = express(); app.use(express.json());
  const context = {
    app,
    requireAttendanceSessionManager(req, res, next) { req.clubAccount = { role: 'pr', email: 'pr@miuegypt.edu.eg' }; next(); },
    requireLiveDatabase() { return true; },
    isActivityScheduledToday() { return true; },
    isAttendanceActivityManuallyEnded: async () => false,
    cleanText: (value, max) => String(value || '').trim().slice(0, max),
    crypto: require('node:crypto'),
    attendanceTokenHash: value => `hash:${value}`,
    assignedMiuAttendanceToken: (id, email) => `miu:${id}:${email}`,
    mongoose: { Types: { ObjectId: class { constructor() { this.value = `session-${++nextId}`; } toString() { return this.value; } } } },
    UniversityContent: { findOne: () => query({ id: 7, type: 'event', title: 'MIU Open Day', date: '2026-10-13', time: '10:00', attendanceEnabled: true, attendanceAudience: 'all_students' }) },
    Club: { findOne: () => query(null) },
    ClubAccount: {
      find: filter => query(filter['email']?.$in?.map(email => ({ email })) || []),
      findOne: filter => query({ email: filter.email })
    },
    StudentAccount: { find: filter => query(filter.email.$in.map(email => ({ email }))) },
    AttendanceSession: {
      find: () => query([]),
      create: async values => {
        const row = { ...values, toObject() { return { ...this, toObject: undefined }; } };
        sessions.push(row); return row;
      },
      exists: async () => false,
      updateMany: async () => { updateManyCalls += 1; return { modifiedCount: 0 }; },
      deleteMany: async () => ({ deletedCount: 0 })
    },
    console
  };
  vm.createContext(context);
  const source = fs.readFileSync(require.resolve('../server'), 'utf8');
  const start = source.indexOf("app.post('/api/club/attendance-sessions'");
  const end = source.indexOf("app.post('/api/member/attendance-assignments/:id/session'", start);
  assert.ok(start >= 0 && end > start);
  vm.runInContext(source.slice(start, end), context);
  const server = await new Promise(resolve => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); });
  t.after(() => new Promise(resolve => server.close(resolve)));
  const request = async body => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/club/attendance-sessions`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    });
    return { status: response.status, data: await response.json() };
  };
  return { request, sessions, get updateManyCalls() { return updateManyCalls; } };
}

test('MIU attendance creates one independent secure task for every assigned usher', async t => {
  const f = await fixture(t);
  const result = await f.request({ clubId: 0, itemType: 'event', eventRequestId: 7, assignments: [
    { supervisorEmail: 'supervisor1@miuegypt.edu.eg', attendanceTakerEmail: 'usher1@miuegypt.edu.eg' },
    { supervisorEmail: 'supervisor2@miuegypt.edu.eg', attendanceTakerEmail: 'usher2@miuegypt.edu.eg' }
  ] });
  assert.equal(result.status, 201);
  assert.equal(result.data.assignmentsCreated, 2);
  assert.equal(f.sessions.length, 2);
  assert.deepEqual(f.sessions.map(session => session.assignedMemberEmail), ['usher1@miuegypt.edu.eg', 'usher2@miuegypt.edu.eg']);
  assert.notEqual(f.sessions[0].tokenHash, f.sessions[1].tokenHash);
  assert.ok(f.sessions.every(session => session.sourceType === 'miu'));
  assert.equal(f.updateManyCalls, 0, 'creating another team must not close an earlier usher session');
  assert.ok(f.sessions.every(session => !('tokenHash' in result.data.sessions.find(item => item.assignedMemberEmail === session.assignedMemberEmail))));
});

test('MIU attendance rejects a repeated usher before creating any session', async t => {
  const f = await fixture(t);
  const result = await f.request({ clubId: 0, itemType: 'event', eventRequestId: 7, assignments: [
    { supervisorEmail: 'supervisor1@miuegypt.edu.eg', attendanceTakerEmail: 'usher@miuegypt.edu.eg' },
    { supervisorEmail: 'supervisor2@miuegypt.edu.eg', attendanceTakerEmail: 'usher@miuegypt.edu.eg' }
  ] });
  assert.equal(result.status, 400);
  assert.equal(f.sessions.length, 0);
});
