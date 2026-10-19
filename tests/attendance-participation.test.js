const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const fs = require('node:fs');
const vm = require('node:vm');
const { registerUsherSelfCheckin, membershipSnapshot, eventRoleLabel } = require('../services/attendance-participation');
const query = value => ({ sort() { return this; }, select() { return this; }, read() { return this; }, readConcern() { return this; }, lean: async () => typeof value === 'function' ? value() : value });

async function fixture(t, options = {}) {
  const records = options.records || [];
  const sessions = ['usher', 'other'].map(email => ({ _id: email + '-session', assignedMemberEmail: email + '@example.test',
    active: true, sourceType: 'miu', assignedMemberAccepted: true, eventRequestId: 9, eventTitle: 'MIU Event',
    eventDate: 'today', eventTime: '12:00', attendanceAudience: 'members', assignedSupervisorEmail: 'reviewer@example.test', ...options.session }));
  const AttendanceSession = {
    findOne: filter => query(() => sessions.find(row => Object.entries(filter).every(([key, value]) => row[key] === value)) || null),
    updateOne: async (filter, update) => {
      const row = sessions.find(row => row._id === filter._id && !row.assignedDeviceHash);
      if (!row) return { modifiedCount: 0 }; Object.assign(row, update.$set); return { modifiedCount: 1 };
    }
  };
  const source = fs.readFileSync(require.resolve('../server'), 'utf8');
  const context = { AttendanceSession, attendanceDeviceHash: id => id, ensureMemberAttendanceDeviceCookie: req => req.headers['x-device'] || 'device-one' };
  vm.createContext(context);
  vm.runInContext(source.slice(source.indexOf('async function bindUsherDevice'), source.indexOf('const ATTENDANCE_QR_PERIOD_MS')), context);
  const app = express(); app.use(express.json());
  registerUsherSelfCheckin(app, {
    requireAttendanceTaskAuth(req, res, next) {
      if (req.headers['x-account'] === 'none') return res.status(401).json({});
      req.attendanceTaskAccount = { email: (req.headers['x-account'] || 'usher') + '@example.test', name: 'Signed-in usher' }; next();
    },
    requireLiveDatabase: () => true, sameOrigin: () => options.sameOrigin !== false,
    AttendanceSession, AttendanceRecord: {
      findOne: filter => query(() => records.find(row => row.clubId === filter.clubId && row.eventRequestId === filter.eventRequestId
        && (row.email === filter.$or[0].email || filter.$or[1].deviceHash.$in.includes(row.deviceHash)))),
      findById: id => query(() => records.find(row => row._id === id)),
      updateOne: async (filter, update) => { Object.assign(records.find(row => row._id === filter._id), update.$set); return { modifiedCount: 1 }; },
      findOneAndUpdate: (filter, update) => query(() => { const row = records.find(row => row._id === filter._id); if (row) Object.assign(row, update.$set); return row; }),
      create: async value => {
        if (options.writeFailure) throw Object.assign(new Error(), { code: 'DATABASE_UNAVAILABLE' });
        if (records.some(row => row.eventRequestId === value.eventRequestId && (row.email === value.email || row.deviceHash === value.deviceHash))) throw Object.assign(new Error(), { code: 11000 });
        const row = { ...value, _id: 'record-' + records.length }; records.push(row); return row;
      }
    },
    StudentAccount: { findOne: () => query(options.profile || { name: 'Verified Student', universityId: '00012', major: 'Engineering' }) },
    UniversityContent: { exists: async () => options.published !== false },
    Club: { find: () => query(options.member ? [{ id: 1, name: 'Engineering' }] : []) },
    Application: { find: () => query([]) },
    isActivityScheduledToday: () => options.today !== false,
    isAttendanceActivityManuallyEnded: async () => options.ended === true,
    bindUsherDevice: context.bindUsherDevice,
    attendanceDeviceHashes: req => [req.headers['x-device'] || 'device-one'],
    cleanText: (value, max) => String(value || '').trim().slice(0, max)
  });
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  t.after(() => new Promise(resolve => server.close(resolve)));
  return { records, sessions, async request(account = 'usher', device = 'device-one', body = {}) {
    const response = await fetch('http://127.0.0.1:' + server.address().port + '/api/miu-attendance-task/check-in', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-account': account, 'x-device': device }, body: JSON.stringify(body) });
    return { status: response.status, data: await response.json() };
  } };
}
test('assigned usher uses verified identity, retains membership separately and enters the normal review workflow', async t => {
  const f = await fixture(t, { member: true });
  assert.equal((await f.request('usher', 'device-one', { email: 'victim@example.test', eventRequestId: 99, eventParticipation: { role: 'president' } })).status, 201);
  const record = f.records[0];
  assert.equal(record.email, 'usher@example.test'); assert.equal(record.name, 'Verified Student');
  assert.equal(record.universityId, '00012'); assert.equal(record.eventRequestId, 9); assert.equal(record.eventParticipation.role, 'usher');
  assert.equal(record.membershipStatus, 'member'); assert.deepEqual(record.memberClubNames, ['Engineering']);
  assert.equal(record.supervisorEmail, 'reviewer@example.test'); assert.equal(record.attendanceAudience, 'members');
});
test('assigned non-member usher can record attendance for their task without being mislabeled a member', async t => {
  const f = await fixture(t); assert.equal((await f.request()).status, 201);
  assert.equal(f.records[0].membershipStatus, 'non_member'); assert.deepEqual(f.records[0].memberClubNames, []);
});
test('self attendance is idempotent and the task binds to one device', async t => {
  const f = await fixture(t); assert.equal((await f.request()).status, 201);
  const repeat = await f.request(); assert.equal(repeat.status, 200); assert.equal(repeat.data.alreadyRecorded, true);
  assert.equal((await f.request('usher', 'device-two')).status, 403); assert.equal(f.records.length, 1);
});
test('same event and device cannot check in another account', async t => {
  const f = await fixture(t); await f.request();
  assert.equal((await f.request('other')).status, 409); assert.equal(f.records.length, 1);
  assert.equal((await f.request('other', 'device-two')).status, 403); // task was bound to the first device even though check-in was denied
});
test('normal attendee record is reused and labeled usher without a second check-in', async t => {
  const f = await fixture(t, { records: [{ _id: 'prior', clubId: 0, eventRequestId: 9, email: 'usher@example.test', deviceHash: 'device-one', attendedAt: 'original timestamp' }] });
  const result = await f.request(); assert.equal(result.status, 200); assert.equal(f.records.length, 1);
  assert.equal(f.records[0].eventParticipation.role, 'usher'); assert.equal(f.records[0].attendedAt, 'original timestamp');
});
test('existing personal attendance on another device cannot be moved to this device', async t => {
  const f = await fixture(t, { records: [{ _id: 'prior', clubId: 0, eventRequestId: 9, email: 'usher@example.test', deviceHash: 'different-device' }] });
  assert.equal((await f.request()).status, 409);
});
test('authentication, assignment acceptance, date, closure, publication and origin guards prevent writes', async t => {
  for (const [options, account, status] of [[{}, 'none', 401], [{}, 'unassigned', 403], [{ session: { assignedMemberAccepted: false } }, 'usher', 403],
    [{ today: false }, 'usher', 410], [{ ended: true }, 'usher', 410], [{ published: false }, 'usher', 410], [{ sameOrigin: false }, 'usher', 403]]) {
    const f = await fixture(t, options); assert.equal((await f.request(account)).status, status); assert.equal(f.records.length, 0);
  }
});
test('membership snapshot resolves accepted memberships only against active clubs', async () => {
  const snapshot = await membershipSnapshot('USER@example.test', {
    Club: { find: filter => query(filter.id ? [] : []) }, Application: { find: () => query([{ clubId: 99 }]) }
  });
  assert.equal(snapshot.membershipStatus, 'non_member'); assert.deepEqual(snapshot.memberClubNames, []);
  assert.equal(eventRoleLabel({ eventParticipation: { role: 'organizer' } }), 'Organizer'); assert.equal(eventRoleLabel({}), 'Attendee');
});
test('canonical attendance device cookie spans scan and task endpoints while retaining valid legacy device hashes', () => {
  const source = fs.readFileSync(require.resolve('../server'), 'utf8'); const emitted = [];
  const crypto = require('node:crypto');
  const context = { crypto, Buffer, sessionSecret: 'test-secret', secureCookieSuffix: () => '',
    requestCookie: (req, key) => req.cookies[key] || '', appendAttendanceCookie: (res, cookie) => emitted.push(cookie) };
  vm.createContext(context); vm.runInContext(source.slice(source.indexOf('function attendanceDeviceId'), source.indexOf('function hasAttendanceScanProof')), context);
  const legacyId = crypto.randomBytes(32).toString('base64url');
  const signature = crypto.createHmac('sha256', 'test-secret').update('attendance-device.' + legacyId).digest('hex');
  const scanRequest = { cookies: { miu_attendance_device: legacyId + '.' + signature } };
  const scanHashes = [...context.attendanceDeviceHashes(scanRequest, {})];
  const canonical = emitted.find(cookie => cookie.startsWith('miu_attendance_event_device='));
  assert.match(canonical, /Path=\/api\/;/); assert.match(canonical, /HttpOnly/);
  const taskRequest = { cookies: { miu_attendance_event_device: canonical.split(';')[0].split('=')[1] } };
  assert.deepEqual([...context.attendanceDeviceHashes(taskRequest, {})], scanHashes);
  assert.equal(context.ensureAttendanceDeviceCookie(taskRequest, {}), legacyId);
});

async function scanFixture(t, duplicateWrite = false) {
  const app = express(); app.use(express.json());
  const session = { _id: 'session', sourceType: 'miu', clubId: 0, itemType: 'event', eventRequestId: 9, eventDate: 'today', attendanceAudience: 'all_students' };
  class Records {
    async save() { throw Object.assign(new Error('duplicate'), { code: 11000, keyPattern: { email: 1 } }); }
    static findOne(filter) {
      if (filter.$or) return query(duplicateWrite ? null : { email: 'usher@example.test', deviceHash: 'same-device-hash' });
      return query({ email: 'student@example.test' });
    }
  }
  const context = {
    app, console, requireStudentAuth(req, res, next) { req.studentAccount = { name: 'Student', email: 'student@example.test' }; next(); },
    requireLiveDatabase: () => true, cleanText: (value, max) => String(value || '').trim().slice(0, max),
    AttendanceSession: { findOne: filter => query(filter.tokenHash ? session : null) }, AttendanceAssignment: { findOne: () => query(null) },
    AttendanceRecord: Records, Club: { find: () => query([]) }, Application: { find: () => query([]) },
    UniversityContent: { exists: async () => true }, isActivityScheduledToday: () => true,
    isAttendanceActivityManuallyEnded: async () => false, hasAttendanceScanProof: () => true,
    attendanceTokenHash: value => value, attendanceDeviceId: () => 'signed-device',
    attendanceDeviceHash: () => 'same-device-hash', attendanceDeviceHashes: () => ['same-device-hash'], clearAttendanceScanProofCookie() {}
  };
  vm.createContext(context);
  const source = fs.readFileSync(require.resolve('../server'), 'utf8');
  vm.runInContext(source.slice(source.indexOf("app.post('/api/attendance/:token'"), source.indexOf("app.get('/api/club/event-registrations'")), context);
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  t.after(() => new Promise(resolve => server.close(resolve)));
  return fetch('http://127.0.0.1:' + server.address().port + '/api/attendance/' + 'X'.repeat(43), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
}
test('legacy university QR cannot write event attendance', async t => {
  const response = await scanFixture(t); assert.equal(response.status, 403);
  assert.match((await response.json()).message, /authorized supervisor/);
});
test('legacy event self-check-in stays denied even when a duplicate write was attempted', async t => {
  const response = await scanFixture(t, true); assert.equal(response.status, 403);
  assert.equal((await response.json()).code, 'SUPERVISOR_SCAN_REQUIRED');
});

test('usher page accepts task and opens authorized scanner instead of self recording', async () => {
  const ids = ['usherTaskMessage', 'usherTask', 'usherTaskTitle', 'usherTaskDate', 'acceptUsherTask', 'openUsherQr', 'usherSelfCheckinForm', 'usherAttendanceStatus', 'usherName', 'usherUniversityId', 'usherMajor', 'recordUsherAttendance', 'usherSelfCheckinFeedback'];
  const elements = Object.fromEntries(ids.map(id => [id, { hidden: true, value: '', textContent: '', dataset: {}, handlers: {}, addEventListener(type, handler) { this.handlers[type] = handler; } }]));
  const task = { eventTitle: 'MIU Event', eventDate: 'today', accepted: false, attendanceAsUsher: false, profile: { name: 'Verified Student', universityId: '00012', major: 'Engineering' } };
  const calls = [];
  const api = async (url, options = {}) => {
    calls.push({ url, ...options });
    if (url.endsWith('/accept')) { task.accepted = true; return { accepted: true }; }
    if (url.endsWith('/check-in')) { assert.equal(elements.usherSelfCheckinForm.dataset.miuDirty, 'true'); task.attendanceAsUsher = true; return { savedToDatabase: true, message: 'Recorded as an usher.' }; }
    return { task };
  };
  vm.runInNewContext(fs.readFileSync(require.resolve('../public/assets/js/pages/my-attendance-task.js'), 'utf8'), {
    document: { getElementById: id => elements[id] }, window: { MiuUI: { createJsonClient: () => api }, addEventListener() {} }
  });
  await Promise.resolve(); assert.equal(elements.usherSelfCheckinForm.hidden, true);
  await elements.acceptUsherTask.handlers.click(); assert.equal(elements.usherSelfCheckinForm.hidden, true);
  assert.equal(elements.usherUniversityId.value, '00012');
  assert.equal(elements.openUsherQr.textContent, 'Open attendance scanner');
  assert.equal(calls.some(call => call.url.endsWith('/check-in')), false);
});

test('MIU supervisor reviews both audience lanes, preserves event roles and approves only the selected assigned list', async t => {
  const records = ['members', 'all_students'].map((attendanceAudience, index) => ({
    _id: 'attendance-' + index, sessionId: 'session-' + index, clubId: 0, itemType: 'event', eventRequestId: 9,
    eventTitle: 'Event', eventDate: 'past', attendanceAudience, supervisorEmail: 'supervisor@example.test',
    approvalStatus: 'pending_supervisor', name: 'Usher ' + index, email: 'usher-' + index + '@example.test', eventParticipation: { role: 'usher' }
  }));
  const matches = (row, filter) => Object.entries(filter).every(([key, value]) => row[key] === value);
  const app = express(); app.use(express.json());
  require('../services/supervisor-dashboard').registerSupervisorDashboard(app, {
    databaseReady: () => true, getAccount: async req => ({ _id: 'sup', email: req.headers['x-email'] || 'supervisor@example.test', role: 'supervisor', assignedClubIds: [] }),
    sameOrigin: () => true, attendanceClosureMapFor: async () => new Map(), attendanceActivityKey: row => String(row.eventRequestId), isAttendanceActivityEnded: () => true,
    AttendanceRecord: {
      find: filter => query(records.filter(row => matches(row, filter))),
      updateMany: async (filter, update) => { const selected = records.filter(row => matches(row, filter)); for (const row of selected) Object.assign(row, update.$set); return { modifiedCount: selected.length }; }
    }, AttendanceSession: { find: () => query([{ createdBy: 'admin@example.test', assignedMemberEmail: 'usher@example.test' }]) }
  });
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  t.after(() => new Promise(resolve => server.close(resolve)));
  const origin = 'http://127.0.0.1:' + server.address().port;
  const listed = await (await fetch(origin + '/api/supervisor/miu-attendance')).json();
  assert.equal(listed.reviews.length, 2);
  assert.deepEqual(listed.reviews.map(r => r.attendanceAudience).sort(), ['all_students', 'members']);
  assert.ok(listed.reviews.every(r => r.records[0].eventParticipation.role === 'usher'));
  const response = await fetch(origin + '/api/supervisor/miu-attendance/9/decision', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'approve', attendanceAudience: 'members' }) });
  assert.equal(response.status, 200); assert.equal(records[0].approvalStatus, 'pending_pr'); assert.equal(records[1].approvalStatus, 'pending_supervisor');
  const unauthorized = await fetch(origin + '/api/supervisor/miu-attendance/9/decision', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-email': 'other-supervisor@example.test' }, body: JSON.stringify({ action: 'approve', attendanceAudience: 'all_students' }) });
  assert.equal(unauthorized.status, 409); assert.equal(records[1].approvalStatus, 'pending_supervisor');
});
