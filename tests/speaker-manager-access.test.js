const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');
const { createSpeakerManagerGuard, speakerManagerIdentity } = require('../services/speaker-manager-access');
const rules = require('../services/speaker-requests');
const source = fs.readFileSync(require.resolve('../server'), 'utf8');
const payload = { speakerName: 'Dr Example', jobTitleCompany: 'Researcher at MIU', proposedTopic: 'Responsible AI', speakerSelectionReason: 'Relevant research experience', expectedStudentBenefit: 'Practical examples for students' };
const query = value => ({ select() { return this; }, sort() { return this; }, lean: async () => value });

async function fixture(t) {
  const app = express(); app.use(express.json());
  const writes = [], uploads = [], grants = [];
  let unavailable = false, archived = false, record;
  const account = req => {
    const role = req.headers['x-test-role'];
    if (!role || role === 'student' || role === 'member' || role === 'applicant') return null;
    return { role, clubId: Number(req.headers['x-test-club'] || 7), committee: 'IT', email: `${role}@miuegypt.edu.eg` };
  };
  const Club = { findOne: filter => query(!archived && filter.id === 7 ? { id: 7, name: 'Fixture club' } : null) };
  const requireLiveDatabase = res => { if (unavailable) res.status(503).json({ message: 'Database unavailable' }); return !unavailable; };
  const guard = createSpeakerManagerGuard({
    Club, requireLiveDatabase, getClubAccountFromRequest: async req => account(req),
    getStudentAccountFromRequest: async req => ['student', 'member', 'applicant'].includes(req.headers['x-test-role']) ? { email: 'student@miuegypt.edu.eg' } : null
  });
  const SpeakerRequest = {
    find: () => query(record ? [record] : []), exists: async () => false,
    findOne: () => query(record), findById: () => query(record),
    async create(value) { writes.push(value); record = { ...value, _id: 'request-id' }; return { toObject: () => record }; },
    findOneAndUpdate(filter, update) { writes.push({ filter, update }); Object.assign(record, update.$set); return query(record); }
  };
  const context = {
    app, Club, SpeakerRequest, requireSpeakerManager: guard, ...rules, crypto,
    requireLiveDatabase, isSameOriginRequest: () => true, cloudinaryConfigured: true,
    getSpeakerRequester: async req => req.speakerRequester,
    publicSpeakerRequest: value => value,
    verifySpeakerRequestAttachments: async () => ({ attachments: [{ publicId: 'existing-private.pdf', name: 'CV.pdf', format: 'pdf' }] }),
    notifySpeakerWorkflow: async () => {}, speakerUploadAttempts: new Map(),
    uploadSpeakerCv: async (_buffer, publicId) => { uploads.push(publicId); return { public_id: publicId, format: 'pdf', bytes: 20 }; },
    SpeakerCvUpload: { create: async value => { grants.push(value); } },
    cloudinary: { uploader: { destroy: async () => {} } },
    mongoose: { isValidObjectId: () => true }, console
  };
  const start = source.indexOf("app.get('/api/speaker-requests/context'");
  const end = source.indexOf("app.post('/api/club/speaker-requests/:id/decision'", start);
  vm.runInNewContext(source.slice(start, end), context);
  const resubmitStart = source.indexOf("app.patch('/api/speaker-requests/:id/resubmit'");
  vm.runInNewContext(source.slice(resubmitStart, source.indexOf("app.get('/api/speaker-requests/:id/cv'", resubmitStart)), context);
  // Use the actual legacy page handler, behind the same real guard.
  const pageStart = source.indexOf("app.get('/speaker-request.html'");
  vm.runInNewContext(source.slice(pageStart, source.indexOf('function publicSpeakerRequest(', pageStart)), { app, requireSpeakerManager: guard });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  return { writes, uploads, grants, setRecord(value) { record = value; }, unavailable() { unavailable = true; }, archived() { archived = true; },
    async call(path, role, method = 'GET', body) {
      const headers = { 'Content-Type': 'application/json' };
      if (role) headers['x-test-role'] = role;
      const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), redirect: 'manual' });
      return { status: response.status, location: response.headers.get('location'), body: await response.text() };
    }
  };
}

test('existing roles authorize presidents and assigned heads, not Vice Presidents or unrelated roles', () => {
  for (const role of ['president', 'head']) assert.ok(speakerManagerIdentity({ role, clubId: 7, email: 'staff@miuegypt.edu.eg', committee: 'IT' }));
  for (const role of ['vice_president', 'student', 'member', 'applicant', 'pr', 'supervisor', 'dean', 'software_development']) assert.equal(speakerManagerIdentity({ role, clubId: 7, email: 'staff@miuegypt.edu.eg', committee: 'IT' }), null);
  assert.equal(speakerManagerIdentity({ role: 'head', clubId: 7, email: 'head@miuegypt.edu.eg' }), null);
});

test('real API and direct page reject anonymous, student/member/applicant and unrelated-role requests before any write or upload', async t => {
  const h = await fixture(t);
  for (const role of [undefined, 'student', 'member', 'applicant', 'vice_president', 'pr', 'supervisor', 'dean', 'software_development']) {
    for (const [path, method] of [['/speaker-request.html', 'GET'], ['/api/speaker-requests/context', 'GET'], ['/api/speaker-requests', 'GET'], ['/api/speaker-requests', 'POST'], ['/api/speaker-requests/cv-upload', 'POST'], ['/api/speaker-requests/request-id/resubmit', 'PATCH']]) {
      const response = await h.call(path, role, method, method === 'GET' ? undefined : payload);
      assert.equal(response.status, role ? 403 : 401, `${role} ${method} ${path}`);
    }
  }
  assert.equal(h.writes.length, 0); assert.equal(h.uploads.length, 0);
});

test('authorized requests preserve fields, private attachment and supervisor approval status; direct page redirects to Club Dashboard', async t => {
  const h = await fixture(t);
  for (const role of ['president', 'head']) {
    assert.equal((await h.call('/api/speaker-requests/context?as=club', role)).status, 200);
    const result = await h.call('/api/speaker-requests', role, 'POST', { ...payload, clubId: 7 });
    assert.equal(result.status, 201);
    const record = JSON.parse(result.body);
    assert.equal(record.clubId, 7); assert.equal(record.status, 'pending_supervisor');
    assert.equal(record.requesterRole, role); assert.equal(record.speakerSelectionReason, payload.speakerSelectionReason);
    assert.equal(record.speakerAttachments[0].name, 'CV.pdf');
    const page = await h.call('/speaker-request.html', role);
    assert.equal(page.status, 303); assert.equal(page.location, '/club-dashboard#speakerRequestDashboardPanel');
  }
});

test('club spoofing, student mode and MIU-hosting bypasses are rejected by real submission/context/upload/resubmit routes', async t => {
  const h = await fixture(t);
  for (const body of [{ clubId: 8 }, { requesterType: 'student' }, { hostingType: 'miu' }]) {
    for (const [path, method] of [['/api/speaker-requests', 'POST'], ['/api/speaker-requests/cv-upload', 'POST'], ['/api/speaker-requests/request-id/resubmit', 'PATCH']]) assert.equal((await h.call(path, 'president', method, { ...payload, ...body })).status, 403);
  }
  assert.equal((await h.call('/api/speaker-requests/context?as=student', 'president')).status, 403);
  assert.equal((await h.call('/api/speaker-requests/context?clubId=8', 'head')).status, 403);
  assert.equal(h.writes.length, 0); assert.equal(h.uploads.length, 0);
});

test('validation failures retain workflow; file validation and private upload ownership remain enforced', async t => {
  const h = await fixture(t);
  assert.equal((await h.call('/api/speaker-requests', 'president', 'POST', { ...payload, speakerName: '' })).status, 400);
  assert.equal((await h.call('/api/speaker-requests/cv-upload', 'head', 'POST', { fileData: 'invalid-file' })).status, 400);
  assert.equal((await h.call('/api/speaker-requests/cv-upload', 'head', 'POST', { fileData: 'data:application/pdf;base64,' + Buffer.from('%PDF-1.4 fixture').toString('base64') })).status, 200);
  assert.equal(h.grants.length, 1);
  assert.equal(h.grants[0].requesterKey, rules.requesterKey(speakerManagerIdentity({ role: 'head', clubId: 7, committee: 'IT', email: 'head@miuegypt.edu.eg' }), 7));
  assert.equal(h.writes.length, 0);
});

test('resubmission preserves attachments and rejects a record from another club', async t => {
  const h = await fixture(t);
  h.setRecord({ _id: 'request-id', clubId: 8, status: 'changes_requested', requesterType: 'club', requesterId: 'other', speakerAttachments: [] });
  assert.equal((await h.call('/api/speaker-requests/request-id/resubmit', 'president', 'PATCH', payload)).status, 404);
  h.setRecord({ _id: 'request-id', clubId: 7, status: 'changes_requested', requesterType: 'club', requesterId: 'other', speakerAttachments: [{ publicId: 'old-private.pdf', format: 'pdf' }] });
  assert.equal((await h.call('/api/speaker-requests/request-id/resubmit', 'president', 'PATCH', payload)).status, 200);
  assert.equal(h.writes[0].update.$set.status, 'pending_supervisor');
});

test('archived clubs and unavailable storage fail closed', async t => {
  const h = await fixture(t); h.archived();
  assert.equal((await h.call('/api/speaker-requests/context', 'president')).status, 403);
  h.unavailable();
  assert.equal((await h.call('/api/speaker-requests', 'head', 'POST', payload)).status, 503);
  assert.equal(h.writes.length, 0);
});
