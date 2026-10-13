const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { registerSupervisorDashboard } = require('../services/supervisor-dashboard');
const { contentResumeStage } = require('../services/supervisor-workflow');
const { recipientFilter } = require('../services/content-request-notifications');
const { ContentRequest, SpeakerRequest, AttendanceRecord } = require('../models');
const query = value => ({ lean: async () => value });

async function fixture(t) {
  let record = { id: 7, _id: 'a'.repeat(24), clubId: 1, type: 'event', status: 'pending_supervisor', supervisorNextStage: 'pending_pr', workflowHistory: [] };
  let unavailable = false; let ended = true; let attendanceStatus = 'pending_supervisor';
  const changes = []; const notifications = [];
  const model = {
    findOne(filter) { if (unavailable) throw new Error('DB_DOWN'); return query(filter.clubId === record.clubId ? record : null); },
    findOneAndUpdate(filter, update) {
      if (record.status !== filter.status) return query(null);
      changes.push(update);
      record = { ...record, ...update.$set };
      for (const [key, value] of Object.entries(update.$push || {})) record[key] = [...(record[key] || []), value];
      return query(record);
    }
  };
  const attendance = {
    find() { return query(attendanceStatus === 'pending_supervisor' ? [{ clubId: 1, itemType: 'event', eventRequestId: 9, eventDate: '2099-01-01' }] : []); },
    async updateMany(filter, update) { changes.push({ filter, update }); attendanceStatus = update.$set.approvalStatus; return { modifiedCount: 1 }; }
  };
  const app = express(); app.use(express.json());
  registerSupervisorDashboard(app, {
    databaseReady: () => true, getAccount: async () => ({ _id: 'supervisor', email: 'supervisor@example.edu', role: 'supervisor', assignedClubIds: [1] }),
    sameOrigin: () => true, ContentRequest: model, SpeakerRequest: model, AttendanceRecord: attendance,
    notifyContent: async saved => notifications.push(saved.status), notifySpeaker: async saved => notifications.push(saved.status),
    attendanceClosureMapFor: async () => new Map(ended ? [['ended', true]] : []),
    attendanceActivityKey: () => 'ended', isAttendanceActivityEnded: () => false
  });
  const server = await new Promise(resolve => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); });
  t.after(() => new Promise(resolve => server.close(resolve)));
  const post = async (path, action = 'approve', comment = '') => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/supervisor/clubs${path}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, comment })
    });
    return { status: response.status, body: await response.json() };
  };
  return { post, changes, notifications, setRecord: value => { record = value; }, record: () => record,
    fail: () => { unavailable = true; }, setEnded: value => { ended = value; } };
}

test('every content type enters supervisor approval and resumes only its server-stored review stage', async t => {
  const state = await fixture(t);
  for (const type of ['event', 'feed', 'sponsor', 'booth', 'entry_permit']) {
    state.setRecord({ ...state.record(), type, status: 'pending_supervisor', supervisorNextStage: 'pending_pr' });
    const result = await state.post('/1/decisions/content/7');
    assert.equal(result.status, 200); assert.equal(result.body.status, 'pending_pr');
    assert.equal(state.record().workflowHistory.at(-1).role, 'supervisor');
    assert.equal((await state.post('/1/decisions/content/7')).status, 409);
  }
  for (const stage of ['pending_english', 'pending_security', 'pending_dean']) {
    state.setRecord({ ...state.record(), status: 'pending_supervisor', supervisorNextStage: stage });
    assert.equal((await state.post('/1/decisions/content/7')).body.status, stage);
  }
  assert.equal(contentResumeStage({ supervisorNextStage: 'published' }), 'pending_pr');
});
test('requesting edits preserves the destination, records feedback and does not approve', async t => {
  const state = await fixture(t);
  state.setRecord({ ...state.record(), supervisorNextStage: 'pending_english' });
  assert.equal((await state.post('/1/decisions/content/7', 'request_edit')).status, 400);
  const result = await state.post('/1/decisions/content/7', 'request_edit', 'Correct the proposed dates.');
  assert.equal(result.body.status, 'changes_requested');
  assert.equal(state.record().supervisorNextStage, 'pending_english');
  assert.equal(state.record().editRequestedBy, 'supervisor');
  assert.equal(state.record().commentHistory.at(-1).text, 'Correct the proposed dates.');
  assert.deepEqual(state.notifications, ['changes_requested']);
});
test('rejecting records the decision and feedback; malformed actions never write', async t => {
  const state = await fixture(t);
  assert.equal((await state.post('/1/decisions/content/7', 'publish', 'Bypass review')).status, 400);
  assert.equal(state.changes.length, 0);
  assert.equal((await state.post('/1/decisions/content/7', 'reject', 'Not suitable.')).body.status, 'rejected');
});
test('unassigned records and self review are denied; failed database reads do not notify', async t => {
  const state = await fixture(t);
  assert.equal((await state.post('/2/decisions/content/7')).status, 404);
  state.setRecord({ ...state.record(), workflowHistory: [{ role: 'club', actorEmail: 'supervisor@example.edu' }] });
  assert.equal((await state.post('/1/decisions/content/7')).status, 403);
  state.fail(); assert.equal((await state.post('/1/decisions/content/7')).status, 503);
  assert.equal(state.changes.length, 0); assert.equal(state.notifications.length, 0);
});
test('speaker requests proceed to Dean only after supervisor approval', async t => {
  const state = await fixture(t);
  state.setRecord({ ...state.record(), requesterEmail: 'club@example.edu', decisionHistory: [] });
  const result = await state.post(`/1/decisions/speaker/${'a'.repeat(24)}`);
  assert.equal(result.body.status, 'pending_dean');
  assert.equal(state.record().decisionHistory.at(-1).action, 'supervisor_approved');
  assert.ok(state.record().clubReviewedAt);
  assert.equal((await state.post(`/1/decisions/speaker/${'a'.repeat(24)}`)).status, 409);
});
test('attendance cannot advance before the event is closed and then proceeds to PR exactly once', async t => {
  const state = await fixture(t);
  state.setEnded(false);
  assert.equal((await state.post('/1/attendance/event/9/decision')).status, 409);
  assert.equal((await state.post('/2/attendance/event/9/decision')).status, 404);
  state.setEnded(true);
  assert.equal((await state.post('/1/attendance/event/9/decision')).body.status, 'pending_pr');
  assert.equal((await state.post('/1/attendance/event/9/decision')).status, 409);
  assert.equal(state.changes[0].filter.clubId, 1);
  assert.equal(state.changes[0].update.$push.approvalHistory.role, 'supervisor');
});
test('schemas accept the new approval stage and reviewer history without widening committee permissions', () => {
  const content = new ContentRequest({ id: 1, clubId: 1, type: 'event', title: 'Talk', status: 'pending_supervisor',
    editRequestedBy: 'supervisor', resubmitTo: 'pending_supervisor', workflowHistory: [{ role: 'supervisor', action: 'approve' }] });
  assert.equal(content.validateSync(), undefined);
  assert.ok(SpeakerRequest.schema.path('status').enumValues.includes('pending_supervisor'));
  assert.equal(new AttendanceRecord().approvalStatus, 'pending_supervisor');
  const filter = recipientFilter({ clubId: 12, status: 'pending_supervisor' });
  assert.ok(filter.$or.some(item => item.role === 'supervisor' && item.assignedClubIds === 12));
  assert.ok(!filter.$or.some(item => item.role === 'pr'));
});

test('real club submission handlers gate all modules and re-enter supervisor review after edits', async () => {
  const fs = require('node:fs'); const vm = require('node:vm');
  const source = fs.readFileSync(require.resolve('../server'), 'utf8');
  let record; let handler;
  const context = {
    console, mongoReady: true, clubs: [{ id: 1, name: 'Test club' }],
    cleanText: value => String(value || '').trim(), contentTitle: (type, body) => body.title || '',
    contentSingularLabel: type => type, contentRequiresTitle: () => true,
    validEntryPermitItems: () => true, extractContentFields: () => ({}), extractSponsorFields: () => ({}),
    missingRequiredPublicContentImage: () => false, notifyContentRequest: async () => {},
    committeeStage: { supervisor: 'pending_supervisor', pr: 'pending_pr', english: 'pending_english', security: 'pending_security' },
    appendWorkflowEvent(doc, role, action, fromStatus, toStatus) { doc.workflowHistory.push({ role, action, fromStatus, toStatus }); },
    ContentRequest: {
      findOne: () => ({ sort: () => ({ lean: async () => null }) }),
      create: async value => {
        record = new ContentRequest(value);
        record.save = async () => { const error = record.validateSync(); if (error) throw error; return record; };
        return record;
      }
    },
    requireClubAuth: () => {}, app: { put: (path, auth, callback) => { handler = callback; } }
  };
  vm.createContext(context);
  const start = source.indexOf('async function createContentRequest(req, res, type)');
  const end = source.indexOf("app.put('/api/club/content/:id'", start);
  vm.runInContext(source.slice(start, end), context);
  const req = { body: { title: 'Proposal', submit: true }, clubAccount: { clubId: 1, role: 'president', email: 'club@example.edu' }, params: { id: '1' } };
  let code = 200;
  const res = { status(value) { code = value; return this; }, json() {} };
  for (const type of ['event', 'feed', 'sponsor', 'booth', 'entry_permit']) {
    await context.createContentRequest(req, res, type);
    assert.equal(code, 201);
    assert.equal(record.status, 'pending_supervisor');
    assert.equal(record.workflowHistory.at(-1).toStatus, 'pending_supervisor');
  }
  const putEnd = source.indexOf("app.delete('/api/club/content/:id'", end);
  vm.runInContext(source.slice(end, putEnd), context);
  context.ContentRequest.findOne = async () => record;
  record.type = 'event'; record.status = 'changes_requested'; record.editRequestedBy = 'english';
  record.resubmitTo = 'pending_english';
  await handler(req, res);
  assert.equal(record.status, 'pending_supervisor'); assert.equal(record.supervisorNextStage, 'pending_english');
  record.status = 'changes_requested'; record.editRequestedBy = 'supervisor';
  await handler(req, res);
  assert.equal(record.status, 'pending_supervisor'); assert.equal(record.supervisorNextStage, 'pending_english');
});
