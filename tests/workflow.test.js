const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const P = require('../services/workflow-policy');
const V = require('../database/values');
const { createWorkflowEngine } = require('../services/workflow-engine');
const express = require('express');
const { registerWorkflowRoutes } = require('../services/workflow-routes');

const admin = { admin: true, email: 'admin@example.test', assignments: [{ role: 'admin' }] };
const owner = { email: 'president@example.test', role: 'president', assignments: [{ role: 'president', clubId: 1 }] };
const actor = (role, clubId = 1) => ({ email: role + '@example.test', assignments: [{ role, clubId, assignedClubIds: [clubId] }] });

function fixture(options = {}) {
  const stores = [], published = [];
  function model() {
    let rows = []; const holder = { get rows() { return rows; }, set rows(value) { rows = value; } }; stores.push(holder);
    const chain = run => ({ session() { return this; }, select() { return this; }, sort() { return this; }, limit() { return this; }, lean: async () => structuredClone(await run()), then(resolve, reject) { return this.lean().then(resolve, reject); } });
    return class Model {
      constructor(values) { Object.assign(this, structuredClone(values)); this._id ||= crypto.randomBytes(12).toString('hex'); if (this.recipientEmail) { this.attempts ??= 0; this.nextAttemptAt ??= new Date(); this.leaseUntil ??= null; } }
      toObject() { return structuredClone({ ...this }); }
      async save() { const value = this.toObject(); value.updatedAt = new Date(); value.createdAt ||= new Date(); const index = rows.findIndex(row => row._id === this._id); if (index < 0) rows.push(value); else rows[index] = value; return this; }
      static async create(values) { const list = Array.isArray(values) ? values : [values], result = []; for (const value of list) { const doc = new this(value); if (options.failNotifications && value.recipientEmail) throw new Error('Simulated outbox failure'); await doc.save(); result.push(doc); } return Array.isArray(values) ? result : result[0]; }
      static find(filter = {}) { return chain(() => rows.filter(row => V.matches(row, filter))); }
      static findOne(filter = {}) { return chain(() => rows.find(row => V.matches(row, filter)) || null); }
      static findOneAndUpdate(filter, operation, settings = {}) { return chain(() => {
        let row = rows.find(row => V.matches(row, filter)); const inserted = !row;
        if (!row && !settings.upsert) return null;
        if (!row) { row = { ...filter, _id: crypto.randomBytes(12).toString('hex'), createdAt: new Date() }; rows.push(row); }
        Object.assign(row, V.update(row, operation, inserted)); row.updatedAt = new Date(); return row;
      }); }
      static updateOne(filter, operation) { return this.findOneAndUpdate(filter, operation); }
      static get rows() { return rows; }
    };
  }
  const ContentRequest = model(), SpeakerRequest = model(), ClubAccount = model(), AuditLog = model(), definitions = model(), notifications = model(), customRoles = model();
  for (const role of ['supervisor', 'pr', 'english', 'security', 'dean', 'president']) {
    // Populate fake accounts synchronously; create writes happen before its first await.
    void ClubAccount.create({ email: role === 'president' ? owner.email : role + '@example.test', role, clubId: 1, assignedClubIds: [1] });
  }
  let queue = Promise.resolve();
  const database = { async startSession() { return { async withTransaction(fn) {
    const beforeQueue = queue; let release; queue = new Promise(resolve => { release = resolve; }); await beforeQueue;
    const before = stores.map(store => structuredClone(store.rows)); const beforePublished = published.length;
    try { return await fn(); } catch (error) { stores.forEach((store, index) => { store.rows = before[index]; }); published.length = beforePublished; throw error; }
    finally { release(); }
  }, async endSession() {} }; } };
  const engine = createWorkflowEngine({ database, ContentRequest, SpeakerRequest, ClubAccount, AuditLog, definitions, notifications, customRoles,
    publish: async record => { published.push(record.id); }, validatePatch: async () => {}, transport: () => options.transport || null,
    adminEmail: () => admin.email, env: options.env || {} });
  const create = (type = 'event', overrides = {}) => engine.createNew('content', { id: ContentRequest.rows.length + 1, type, title: 'Club event', clubId: 1, clubName: 'Club One', description: 'Original description', date: '2030-10-20', time: '10:00', location: 'Main hall', status: 'pending_supervisor', ...overrides }, owner);
  const decision = (row, role, action = 'approve', extra = {}) => engine.decide('content', row.id, actor(role), { revision: row.workflow.revision, action, comment: 'Review instructions', ...extra });
  return { engine, create, decision, ContentRequest, SpeakerRequest, definitions, notifications, AuditLog, ClubAccount, published, customRoles };
}

test('direct messages accept external email, persist only requested channels and deduplicate retries', async () => {
  const f = fixture();
  const payload = { requestId: crypto.randomUUID(), email: ' External@Example.test ', channel: 'email', title: 'Meeting reminder', message: 'Please join at 10:00.\nThank you.' };
  const result = await f.engine.sendMessage(admin, payload);
  assert.equal(result.emailStatus, 'unconfigured');
  assert.equal(f.notifications.rows[0].recipientEmail, 'external@example.test');
  assert.equal(f.notifications.rows[0].delivery.channel, 'email');
  assert.equal(f.notifications.rows[0].delivery.senderEmail, admin.email);
  assert.equal((await f.engine.sendMessage(admin, payload)).id, result.id);
  assert.equal(f.notifications.rows.length, 1);
  assert.equal(f.AuditLog.rows.filter(row => row.action === 'workflow_message_queued').length, 1);
  await assert.rejects(f.engine.sendMessage(admin, { ...payload, title: 'Changed after sending' }), /already submitted/);
  for (const channel of ['notification', 'both']) {
    await assert.rejects(f.engine.sendMessage(admin, { ...payload, requestId: crypto.randomUUID(), channel }), /registered staff account/);
    const queued = await f.engine.sendMessage(admin, { ...payload, requestId: crypto.randomUUID(), email: owner.email, channel });
    assert.equal(queued.emailStatus, channel === 'notification' ? null : 'unconfigured');
  }
});

test('direct message validation rejects untrusted senders, header injection and invalid payloads without writes', async () => {
  const f = fixture();
  const valid = { requestId: crypto.randomUUID(), email: 'external@example.test', channel: 'email', title: 'Hello', message: 'A message' };
  await assert.rejects(f.engine.sendMessage(owner, valid), /Administrator/);
  for (const change of [{ email: 'a@example.test\r\nBcc: other@example.test' }, { email: 'a@example.test,b@example.test' }, { title: 'Hi\nBcc: other' }, { title: 'a'.repeat(161) }, { message: ' ' }, { message: 'a'.repeat(5001) }, { channel: 'push' }, { requestId: 'invalid' }]) await assert.rejects(f.engine.sendMessage(admin, { ...valid, ...change }), P.WorkflowError);
  assert.equal(f.notifications.rows.length, 0); assert.equal(f.AuditLog.rows.length, 0);
});

test('direct notification and audit writes roll back together when the outbox fails', async () => {
  const f = fixture({ failNotifications: true });
  await assert.rejects(f.engine.sendMessage(admin, { requestId: crypto.randomUUID(), email: owner.email, channel: 'both', title: 'Hello', message: 'A message' }), /outbox/);
  assert.equal(f.notifications.rows.length, 0); assert.equal(f.AuditLog.rows.length, 0);
});

test('direct email worker sends external mail, excludes notification-only messages and records failures', async () => {
  const sent = [];
  const f = fixture({ transport: { async sendMail(message) { sent.push(message); return { accepted: [message.to], messageId: 'test-delivery' }; } }, env: { EMAIL_FROM: 'site@example.test', SITE_URL: 'https://example.test' } });
  const payload = { requestId: crypto.randomUUID(), email: 'external@example.test', channel: 'email', title: 'Hello', message: 'External message' };
  await f.engine.sendMessage(admin, payload);
  for (let i = 0; i < 30 && f.notifications.rows[0].emailStatus !== 'sent'; i++) await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(f.notifications.rows[0].emailStatus, 'sent');
  assert.equal(sent.length, 1); assert.equal(sent[0].to, 'external@example.test'); assert.equal(sent[0].text, 'External message');
  await f.engine.sendMessage(admin, { ...payload, requestId: crypto.randomUUID(), email: owner.email, channel: 'notification' });
  await f.engine.deliver(); assert.equal(sent.length, 1);
  assert.ok(f.AuditLog.rows.some(row => row.action === 'workflow_email_sent'));
  const failed = fixture({ transport: { async sendMail() { throw new Error('SMTP unavailable'); } }, env: { EMAIL_FROM: 'site@example.test', SITE_URL: 'https://example.test' } });
  await failed.engine.sendMessage(admin, payload);
  for (let i = 0; i < 30 && failed.notifications.rows[0].emailStatus !== 'failed'; i++) await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(failed.notifications.rows[0].emailStatus, 'failed');
  assert.ok(failed.AuditLog.rows.some(row => row.action === 'workflow_email_failed'));
});

test('direct message endpoints restrict sending to same-origin admins and keep recipient inboxes private', async t => {
  const f = fixture(), app = express(); app.use(express.json());
  const actorFor = req => req.get('x-test-role') === 'admin' ? admin : req.get('x-test-role') === 'president' ? owner : req.get('x-test-role') ? actor(req.get('x-test-role')) : null;
  registerWorkflowRoutes(app, { engine: f.engine, actorFor, ready: async () => true, sameOrigin: req => req.get('origin') === 'http://example.test', requireAdmin: (req, res, next) => req.get('x-test-role') === 'admin' ? next() : res.status(403).end() });
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve)); t.after(() => new Promise(resolve => server.close(resolve)));
  const call = (path, role, body, origin = 'http://example.test') => fetch(`http://127.0.0.1:${server.address().port}${path}`, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', Origin: origin, ...(role ? { 'x-test-role': role } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const payload = { requestId: crypto.randomUUID(), email: owner.email, channel: 'notification', title: 'Private reminder', message: 'For the president only.' };
  assert.equal((await call('/api/admin/workflows/messages', 'pr', payload)).status, 403);
  assert.equal((await call('/api/admin/workflows/messages', 'admin', payload, 'https://other.test')).status, 403);
  assert.equal((await call('/api/admin/workflows/message-recipients', 'pr')).status, 403);
  const recipients = await (await call('/api/admin/workflows/message-recipients', 'admin')).json();
  assert.ok(recipients.recipients.some(item => item.email === owner.email && item.canNotify));
  assert.equal((await call('/api/admin/workflows/messages', 'admin', payload)).status, 202);
  const own = await (await call('/api/workflow/notifications', 'president')).json();
  assert.equal(own.length, 1); assert.equal(own[0].message, payload.message);
  assert.equal((await (await call('/api/workflow/notifications', 'pr')).json()).length, 0);
  assert.equal((await call(`/api/workflow/notifications/${own[0]._id}/read`, 'pr', {})).status, 404);
  assert.equal((await call(`/api/workflow/notifications/${own[0]._id}/read`, 'president', {})).status, 200);
  assert.equal((await call(`/api/workflow/notifications/${own[0]._id}/retry`, 'admin', {})).status, 404);
  await call('/api/admin/workflows/messages', 'admin', { ...payload, requestId: crypto.randomUUID(), channel: 'email' });
  assert.equal((await (await call('/api/workflow/notifications', 'president')).json()).length, 1, 'Email-only messages do not appear in the site inbox');
});

test('direct delivery metadata fits the existing SQL payload without new columns', async () => {
  const { WorkflowNotification } = require('../services/workflow-models');
  const spec = require('../database/schema').describe(WorkflowNotification);
  assert.equal(spec.columns.some(column => column.name === 'delivery'), false);
  const row = new WorkflowNotification({ eventKey: 'test', recipientEmail: owner.email, kind: 'message', requestRef: crypto.randomUUID(), title: 'Hello', message: 'Test', link: '/pages/workflow.html', emailStatus: null, delivery: { channel: 'notification', senderEmail: admin.email } });
  await row.validate(); assert.equal(row.toObject().delivery.channel, 'notification');
  const query = require('../database/query').compile(spec, { 'delivery.channel': { $ne: 'notification' } });
  assert.match(query.text, /JSON_VALUE/); assert.ok(query.parameters.some(parameter => parameter.value === 'notification'));
});

test('empty teams retain the request at their current stage until an administrator reviews', async () => {
  const f = fixture(); f.ClubAccount.rows.splice(0, f.ClubAccount.rows.length);
  let row = (await f.create()).toObject();
  assert.equal(row.workflow.stageId, 'supervisor'); assert.equal(row.workflow.blocked.reason, 'no_reviewers');
  assert.deepEqual(row.workflow.blocked.missingRoles, ['supervisor']); assert.deepEqual(f.published, []);
  await f.engine.reconcile(); assert.equal(f.ContentRequest.rows[0].workflow.stageId, 'supervisor');
  for (const role of ['supervisor', 'pr', 'english', 'dean']) {
    row = await f.engine.decide('content', row.id, admin, { revision: row.workflow.revision, action: 'approve', reviewRole: role, comment: 'Administrator review' });
    const decision = row.workflow.history.filter(event => event.action === 'approve').at(-1);
    assert.equal(decision.actorEmail, admin.email); assert.equal(decision.actorRole, 'admin'); assert.equal(decision.onBehalfOfRole, role);
  }
  assert.equal(row.workflow.state, 'approved'); assert.deepEqual(f.published, [1]);
  assert.ok(!row.workflow.history.some(event => event.action === 'stage_skipped_no_reviewers'));
});

test('administrators review populated roles too, enforce stage permissions and preserve correction rules', async () => {
  const f = fixture(); let row = (await f.create()).toObject();
  await assert.rejects(f.engine.decide('content', row.id, admin, { revision: row.workflow.revision, action: 'approve', reviewRole: 'dean' }), /current stage/);
  await assert.rejects(f.engine.decide('content', row.id, owner, { revision: row.workflow.revision, action: 'approve', reviewRole: 'supervisor' }), /not permitted/);
  row = await f.engine.decide('content', row.id, admin, { revision: row.workflow.revision, action: 'request_changes', reviewRole: 'supervisor', fields: ['description'], comment: 'Please correct this description.' });
  assert.equal(row.workflow.state, 'changes_requested'); assert.deepEqual(row.workflow.revisionFields, ['description']);
  assert.equal(row.workflow.history.at(-1).onBehalfOfRole, 'supervisor');
  await assert.rejects(f.engine.resubmit('content', row.id, owner, { revision: row.workflow.revision, changes: { date: '2031-01-01' } }), /locked/);
  row = await f.engine.resubmit('content', row.id, owner, { revision: row.workflow.revision, changes: { description: 'Corrected description' } });
  row = await f.engine.decide('content', row.id, admin, { revision: row.workflow.revision, action: 'reject', reviewRole: 'supervisor', comment: 'Cannot proceed' });
  assert.equal(row.workflow.state, 'rejected'); assert.deepEqual(f.published, []);
});

test('administrator approvals cover one selected role at a time in all-role stages and cannot be repeated', async () => {
  const f = fixture(), config = P.defaults('event');
  config.stages[0].roles = ['supervisor', 'pr']; config.stages[0].permissions.pr = [...config.stages[0].permissions.supervisor]; config.stages[0].approvalRule = 'all_roles';
  await f.engine.definition('event'); await f.engine.saveDefinition('event', admin, { version: 1, config });
  f.ClubAccount.rows.splice(0, f.ClubAccount.rows.length);
  let row = (await f.create()).toObject();
  await assert.rejects(f.engine.decide('content', row.id, admin, { revision: row.workflow.revision, action: 'approve' }), /Choose a review role/);
  row = await f.engine.decide('content', row.id, admin, { revision: row.workflow.revision, action: 'approve', reviewRole: 'supervisor' });
  assert.equal(row.workflow.stageId, 'supervisor'); assert.equal(row.workflow.approvals.length, 1);
  await assert.rejects(f.engine.decide('content', row.id, admin, { revision: row.workflow.revision, action: 'approve', reviewRole: 'supervisor' }), /already approved/);
  row = await f.engine.decide('content', row.id, admin, { revision: row.workflow.revision, action: 'approve', reviewRole: 'pr' });
  assert.equal(row.workflow.stageId, 'pr'); assert.equal(row.workflow.history.filter(event => event.action === 'approve').length, 2);
});

test('availability checks retain snapshots, approvals and assignments without skipping or publishing', async () => {
  const f = fixture(); let row = (await f.create()).toObject();
  row = await f.engine.decide('content', row.id, admin, { revision: row.workflow.revision, action: 'assign', emails: ['supervisor@example.test'], comment: 'Assigned reviewer' });
  f.ClubAccount.rows.find(row => row.role === 'supervisor').email = 'replacement@example.test';
  await f.engine.reconcile(); row = f.ContentRequest.rows[0];
  assert.equal(row.workflow.stageId, 'supervisor'); assert.deepEqual(row.workflow.blocked.assignedEmails, ['supervisor@example.test']);
  const count = f.AuditLog.rows.length;
  assert.equal((await f.engine.reconcile()).changed, 0); assert.equal(f.AuditLog.rows.length, count);
  row = await f.engine.decide('content', row.id, admin, { revision: row.workflow.revision, action: 'assign', emails: ['replacement@example.test'], comment: 'Replace unavailable reviewer' });
  assert.equal(row.workflow.blocked, undefined); assert.deepEqual(f.published, []);
});

test('blocked inbox provides the same review data and actions to administrators while staying private', async t => {
  const f = fixture(); f.ClubAccount.rows.splice(0, f.ClubAccount.rows.length); await f.create();
  const app = express(); app.use(express.json());
  registerWorkflowRoutes(app, { engine: f.engine, actorFor: req => req.get('x-test-role') === 'admin' ? admin : owner, ready: async () => true, sameOrigin: req => req.get('origin') === 'http://example.test', requireAdmin: (req, res, next) => req.get('x-test-role') === 'admin' ? next() : res.sendStatus(403) });
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve)); t.after(() => new Promise(resolve => server.close(resolve)));
  const call = (path, role = 'admin', body, origin = 'http://example.test') => fetch('http://127.0.0.1:' + server.address().port + path, { method: body ? 'POST' : 'GET', headers: { 'x-test-role': role, 'Content-Type': 'application/json', Origin: origin }, body: body ? JSON.stringify(body) : undefined });
  assert.equal((await call('/api/admin/workflows/blocked', 'president')).status, 403);
  const blocked = await (await call('/api/admin/workflows/blocked')).json(); assert.equal(blocked.total, 1); assert.equal(blocked.items[0].stage, 'Supervisor');
  const summary = await (await call('/api/admin/workflows/blocked?summary=1')).json();
  assert.deepEqual(summary, { total: 1, keys: blocked.keys }); assert.equal(summary.items, undefined);
  assert.equal((await f.engine.reconcile()).changed, 0, 'Availability rechecks preserve each block identity');
  assert.deepEqual((await (await call('/api/admin/workflows/blocked?summary=1')).json()).keys, summary.keys);
  const view = await (await call('/api/workflow/requests/content/1')).json();
  assert.ok(view.actions.includes('approve')); assert.ok(view.actions.includes('request_changes')); assert.ok(view.actions.includes('reject'));
  assert.equal(view.values.description, 'Original description'); assert.ok(view.fields.some(field => field.id === 'description'));
  assert.deepEqual(view.adminReviewRoles[0].id, 'supervisor');
  const decision = { revision: view.workflow.revision, action: 'approve', reviewRole: 'supervisor' };
  assert.equal((await call('/api/workflow/requests/content/1/decision', 'admin', decision, 'https://other.test')).status, 403);
  assert.equal((await call('/api/workflow/requests/content/1/decision', 'admin', decision)).status, 200);
  assert.equal(f.ContentRequest.rows[0].workflow.stageId, 'pr');
});

test('administrator override supports disabled custom roles and checks selected-role permissions', async () => {
  const f = fixture(), config = P.defaults('event');
  await f.customRoles.create({ key: 'custom_review', name: 'Review team', enabled: true, scope: 'global', modules: ['requests'], requestTypes: ['event'], permissions: P.actions });
  config.stages[0].roles = ['custom_review', 'supervisor']; config.stages[0].permissions = { custom_review: ['comment', 'history'], supervisor: ['approve', 'reject'] };
  await f.engine.definition('event'); await f.engine.saveDefinition('event', admin, { version: 1, config });
  let row = (await f.create()).toObject(); f.customRoles.rows[0].enabled = false;
  await assert.rejects(f.engine.decide('content', row.id, admin, { revision: row.workflow.revision, action: 'approve', reviewRole: 'custom_review' }), /not enabled/);
  row = await f.engine.decide('content', row.id, admin, { revision: row.workflow.revision, action: 'comment', reviewRole: 'custom_review', comment: 'Administrative note' });
  assert.equal(row.workflow.stageId, 'supervisor'); assert.equal(row.workflow.history.at(-1).onBehalfOfRole, 'custom_review');
});

test('administrator approvals roll back publication and audit on outbox failure', async () => {
  const options = {}, f = fixture(options); let row = (await f.create()).toObject();
  for (const role of ['supervisor', 'pr', 'english']) row = await f.decision(row, role);
  const count = f.AuditLog.rows.length; options.failNotifications = true;
  await assert.rejects(f.engine.decide('content', row.id, admin, { revision: row.workflow.revision, action: 'approve', reviewRole: 'dean' }), /outbox failure/);
  assert.equal(f.ContentRequest.rows[0].workflow.stageId, 'dean'); assert.equal(f.AuditLog.rows.length, count); assert.deepEqual(f.published, []);
  options.failNotifications = false;
  row = await f.engine.decide('content', row.id, admin, { revision: row.workflow.revision, action: 'approve', reviewRole: 'dean' });
  assert.equal(row.workflow.state, 'approved'); assert.deepEqual(f.published, [1]);
});

test('configuration rejects cycles, invalid stages, unknown roles/fields, inaccessible stages and invalid escalation', () => {
  const config = P.defaults('event');
  for (const change of [c => { c.start = 'missing'; }, c => { c.stages[3].next = 'supervisor'; }, c => { c.stages[0].roles = ['hacker']; }, c => { c.stages[0].editableFields = ['status']; }, c => { c.stages[0].escalationTargets = ['supervisor']; }, c => { c.stages[0].permissions.supervisor = []; }]) {
    const copy = P.clone(config); change(copy); assert.throws(() => P.validateDefinition(copy, 'event'), P.WorkflowError);
  }
  const disabled = P.clone(config); disabled.stages[1].enabled = false; assert.doesNotThrow(() => P.validateDefinition(disabled, 'event'));
});
test('new requests enter the configured stage and final approval publishes inside the workflow transaction', async () => {
  const f = fixture(); let row = (await f.create()).toObject();
  assert.equal(row.workflow.stageId, 'supervisor');
  for (const role of ['supervisor', 'pr', 'english', 'dean']) row = await f.decision(row, role);
  assert.equal(row.status, 'published'); assert.equal(row.workflow.state, 'approved'); assert.deepEqual(f.published, [1]);
  assert.equal(f.AuditLog.rows.length, 5); assert.ok(f.notifications.rows.length >= 5);
});
test('description-only return rejects locked field changes and preserves date, time and location', async () => {
  const f = fixture(); let row = (await f.create()).toObject();
  row = await f.decision(row, 'supervisor', 'request_changes', { fields: ['description'], fieldComments: { description: 'Correct the English grammar.' } });
  assert.equal(row.status, 'changes_requested');
  await assert.rejects(f.engine.resubmit('content', row.id, owner, { revision: row.workflow.revision, changes: { description: 'Corrected description', date: '2031-01-01' } }), /locked/);
  row = await f.engine.resubmit('content', row.id, owner, { revision: row.workflow.revision, changes: { description: 'Corrected description' } });
  assert.equal(row.date, '2030-10-20'); assert.equal(row.time, '10:00'); assert.equal(row.location, 'Main hall'); assert.equal(row.workflow.stageId, 'supervisor');
  const history = row.workflow.history.find(event => event.action === 'resubmitted');
  assert.equal(history.before.description, 'Original description'); assert.equal(history.after.description, 'Corrected description');
  assert.equal(history.fieldComments.description, 'Correct the English grammar.');
});
test('several revision rounds retain different allowlists, comments and submitted values', async () => {
  const f = fixture(); let row = (await f.create()).toObject();
  row = await f.decision(row, 'supervisor', 'request_changes', { fields: ['description', 'location'] });
  row = await f.engine.resubmit('content', row.id, owner, { revision: row.workflow.revision, changes: { description: 'New description', location: 'Auditorium' } });
  row = await f.decision(row, 'supervisor', 'request_changes', { fields: ['date'] });
  await assert.rejects(f.engine.resubmit('content', row.id, owner, { revision: row.workflow.revision, changes: { description: 'Forbidden second change' } }), /locked/);
  row = await f.engine.resubmit('content', row.id, owner, { revision: row.workflow.revision, changes: { date: '2030-10-22' } });
  assert.equal(row.workflow.history.filter(event => event.action === 'request_changes').length, 2);
  assert.equal(row.description, 'New description'); assert.equal(row.location, 'Auditorium');
});
test('rejecting is terminal and never treated as requesting changes', async () => {
  const f = fixture(); let row = (await f.create()).toObject(); row = await f.decision(row, 'supervisor', 'reject');
  assert.equal(row.workflow.state, 'rejected');
  await assert.rejects(f.engine.resubmit('content', row.id, owner, { revision: row.workflow.revision, changes: { description: 'New' } }), /no longer open/);
});
test('backend denies unrelated clubs, wrong reviewers, self-approval, missing comments and duplicate/stale actions', async () => {
  const f = fixture(); const row = (await f.create()).toObject();
  await assert.rejects(f.engine.request('content', row.id, { email: 'other@example.test', assignments: [{ role: 'president', clubId: 2 }] }), /not found/);
  await assert.rejects(f.decision(row, 'english'), /not permitted/);
  await assert.rejects(f.engine.decide('content', row.id, owner, { revision: 1, action: 'approve' }), /not permitted/);
  await assert.rejects(f.decision(row, 'supervisor', 'request_changes', { comment: '', fields: ['description'] }), /instructions/);
  const results = await Promise.allSettled([f.decision(row, 'supervisor'), f.decision(row, 'supervisor')]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.filter(result => result.status === 'rejected').length, 1);
});
test('configuration edits are admin-only, versioned and cannot alter active request snapshots', async () => {
  const f = fixture(); const row = (await f.create()).toObject(); const saved = await f.engine.definition('event');
  const config = P.clone(saved.config); config.stages[0].name = 'Updated supervisor';
  await assert.rejects(f.engine.saveDefinition('event', actor('pr'), { version: 1, config }), /Administrator/);
  await f.engine.saveDefinition('event', admin, { version: 1, config });
  assert.equal(f.ContentRequest.rows[0].workflow.definition.stages[0].name, 'Supervisor');
  assert.equal((await f.create()).workflow.definition.stages[0].name, 'Updated supervisor');
  await assert.rejects(f.engine.saveDefinition('event', admin, { version: 1, config }), /changed/);
});
test('multi-role approval requires distinct reviewers and disabled stages are skipped safely', async () => {
  const f = fixture(); let config = P.defaults('event'); config.stages[0].roles = ['supervisor', 'pr']; config.stages[0].permissions.pr = config.stages[0].permissions.supervisor; config.stages[0].approvalRule = 'all_roles';
  await f.engine.definition('event'); await f.engine.saveDefinition('event', admin, { version: 1, config });
  let row = (await f.create()).toObject(); row = await f.decision(row, 'supervisor'); assert.equal(row.workflow.stageId, 'supervisor');
  row = await f.decision(row, 'pr'); assert.equal(row.workflow.stageId, 'pr');
  config = P.defaults('feed'); config.stages[1].enabled = false;
  await f.engine.definition('feed'); await f.engine.saveDefinition('feed', admin, { version: 1, config });
  let feed = (await f.create('feed')).toObject(); feed = await f.decision(feed, 'supervisor'); assert.equal(feed.workflow.stageId, 'english');
});
test('a notification failure rolls back the request, history, audit and publication together', async () => {
  const f = fixture({ failNotifications: true });
  await assert.rejects(f.create(), /outbox failure/);
  assert.equal(f.ContentRequest.rows.length, 0); assert.equal(f.AuditLog.rows.length, 0); assert.equal(f.published.length, 0);
});
test('email failures persist as failed and never block the approval transaction or claim delivery', async () => {
  const f = fixture({ transport: { sendMail: async () => { throw new Error('SMTP down'); } }, env: { EMAIL_FROM: 'sender@example.test', SITE_URL: 'https://example.test' } });
  await f.create();
  await new Promise(resolve => setImmediate(resolve));
  await f.engine.deliver();
  assert.equal(f.ContentRequest.rows.length, 1);
  assert.ok(f.notifications.rows.some(row => row.emailStatus === 'failed'));
  assert.ok(!f.notifications.rows.some(row => row.emailStatus === 'sent'));
  assert.ok(f.AuditLog.rows.some(row => row.action === 'workflow_email_failed'));
});

test('successful SMTP delivery is recorded, audited and not resent on another queue run', async () => {
  const sent = [];
  const f = fixture({ transport: { sendMail: async message => { sent.push(message); return { accepted: [message.to], rejected: [], messageId: message.messageId }; } }, env: { EMAIL_FROM: 'sender@example.test', SITE_URL: 'https://example.test' } });
  await f.create(); await new Promise(resolve => setImmediate(resolve)); await f.engine.deliver();
  assert.ok(sent.length); assert.ok(f.notifications.rows.every(row => row.emailStatus === 'sent'));
  assert.ok(f.AuditLog.rows.some(row => row.action === 'workflow_email_sent'));
  assert.ok(sent.every(message => message.text.includes('https://example.test/pages/workflow.html?kind=content&id=1')));
  const count = sent.length; await f.engine.deliver(); assert.equal(sent.length, count);
});

test('queued email is cancelled when staff access is removed before delivery', async () => {
  const settings = { env: { EMAIL_FROM: 'sender@example.test', SITE_URL: 'https://example.test' } };
  const f = fixture(settings); await f.create(); await new Promise(resolve => setImmediate(resolve));
  f.ClubAccount.rows.length = 0; let sent = 0;
  settings.transport = { sendMail: async () => { sent++; return { accepted: ['someone@example.test'] }; } };
  await f.engine.deliver(); assert.equal(sent, 0);
  assert.ok(f.notifications.rows.every(row => row.errorCode === 'RECIPIENT_ACCESS_REVOKED' && row.emailStatus === 'failed'));
  assert.ok(f.AuditLog.rows.some(row => row.action === 'workflow_email_cancelled'));
});

test('configured escalation and automatic routing cannot skip unconfigured stages', async () => {
  const f = fixture(); const config = P.defaults('event'); config.stages[0].escalationTargets = ['english'];
  await f.engine.saveDefinition('event', admin, { version: 1, config });
  let row = (await f.create()).toObject();
  await assert.rejects(f.decision(row, 'supervisor', 'forward', { target: 'dean' }), /destination/);
  row = await f.decision(row, 'supervisor', 'forward', { target: 'english' }); assert.equal(row.workflow.stageId, 'english');
  const automatic = P.defaults('feed'); automatic.stages[0].automatic = true; automatic.stages[0].editableFields = []; automatic.stages[0].permissions.supervisor = ['approve', 'history'];
  await f.engine.saveDefinition('feed', admin, { version: 1, config: automatic });
  const feed = await f.create('feed'); assert.equal(feed.workflow.stageId, 'pr');
  assert.ok(feed.workflow.history.some(event => event.action === 'automatic_forward'));
});

test('date and time corrections reject impossible dates and out-of-range times', () => {
  const record = { type: 'event', date: '2030-01-01', time: '10:00', workflow: { revisionFields: ['date', 'time'] } };
  for (const changes of [{ date: '2030-02-30' }, { date: '2030-99-01' }, { time: '25:00' }, { time: '12:99' }]) assert.throws(() => P.revisionPatch(record, changes), P.WorkflowError);
});
test('structured permit revisions reject arbitrary object properties and invalid rows', () => {
  const record = { type: 'entry_permit', permitItems: [{ quantity: 1, number: 'A1', details: 'Chair' }], workflow: { revisionFields: ['permitItems'] } };
  assert.throws(() => P.revisionPatch(record, { permitItems: [{ quantity: 0, number: 'A1', details: 'Chair' }] }));
  assert.throws(() => P.revisionPatch(record, { permitItems: [{ quantity: 2, number: 'A1', details: 'Chair', clubId: 999 }] }));
  assert.deepEqual(P.revisionPatch(record, { permitItems: [{ quantity: 2, number: 'A1', details: 'Chair' }] }).permitItems[0].quantity, 2);
});

test('HTTP workflow endpoints enforce authentication, role scope, locked fields, stale versions and legacy bypass protection', async t => {
  const f = fixture(); await f.create();
  await f.ClubAccount.create({ email: 'supervisor2@example.test', role: 'supervisor', assignedClubIds: [2] });
  await f.create('event', { clubId: 2, clubName: 'Other private club' });
  const app = express(); app.use(express.json());
  let legacyWrites = 0;
  const actorFor = req => req.get('x-test-role') === 'admin' ? admin : req.get('x-test-role') === 'president' ? owner : req.get('x-test-role') ? actor(req.get('x-test-role'), Number(req.get('x-test-club') || 1)) : null;
  registerWorkflowRoutes(app, { engine: f.engine, actorFor, ready: async () => true, sameOrigin: req => req.get('origin') === 'http://example.test', requireAdmin: (req, res, next) => req.get('x-test-role') === 'admin' ? next() : res.status(403).json({ message: 'Admin required' }) });
  app.put('/api/club/content/:id', (req, res) => { legacyWrites++; res.json({ updated: true }); });
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const url = '/api/workflow/requests/content/1';
  const call = (path, role = '', method = 'GET', body) => fetch(`http://127.0.0.1:${server.address().port}${path}`, { method, headers: { 'Content-Type': 'application/json', Origin: 'http://example.test', ...(role ? { 'x-test-role': role } : {}) }, body: body ? JSON.stringify(body) : undefined });
  assert.equal((await call(url)).status, 401);
  assert.equal((await call('/api/admin/workflows', 'pr')).status, 403);
  const listing = await (await call('/api/workflow/requests', 'president')).json();
  assert.deepEqual(listing.filters.clubs, [{ id: '1', name: 'Club One' }], 'Filter choices never disclose other clubs');
  assert.ok(listing.filters.stages.some(stage => stage.id === 'supervisor' && stage.name === 'Supervisor'));
  const noMatches = await (await call('/api/workflow/requests?clubId=999', 'president')).json();
  assert.equal(noMatches.total, 0); assert.deepEqual(noMatches.filters, listing.filters, 'Named choices remain available when a filter has no matches');
  assert.equal((await call(url + '/decision', 'english', 'POST', { revision: 1, action: 'approve' })).status, 403);
  const returned = await call(url + '/decision', 'supervisor', 'POST', { revision: 1, action: 'request_changes', fields: ['description'], comment: 'Fix English grammar' });
  assert.equal(returned.status, 200);
  const data = await returned.json(); assert.deepEqual(data.workflow.revisionFields, ['description']);
  assert.equal((await call('/api/club/content/1', 'president', 'PUT', { description: 'Bypass', date: '2031-01-01' })).status, 409);
  assert.equal(legacyWrites, 0);
  assert.equal((await call(url + '/resubmit', 'president', 'POST', { revision: 2, changes: { description: 'New description', location: 'Forbidden location' } })).status, 403);
  assert.equal((await call(url + '/resubmit', 'president', 'POST', { revision: 2, changes: { description: 'New description' } })).status, 200);
  assert.equal((await call(url + '/resubmit', 'president', 'POST', { revision: 2, changes: { description: 'Stale update' } })).status, 409);
  const view = await (await call(url, 'president')).json(); assert.equal(view.values.location, 'Main hall'); assert.equal(view.values.description, 'New description');
  assert.equal((await call('/api/workflow/requests/content/not-an-id', 'president')).status, 404);
});

test('persisted notifications are private and can be marked read only by their recipient', async t => {
  const f = fixture(); await f.create(); const app = express(); app.use(express.json());
  registerWorkflowRoutes(app, { engine: f.engine, actorFor: req => req.get('x-test-role') === 'president' ? owner : actor(req.get('x-test-role') || 'pr'), ready: async () => true, sameOrigin: () => true, requireAdmin: (req, res) => res.status(403).end() });
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const ownNotifications = await (await fetch(base + '/api/workflow/notifications', { headers: { 'x-test-role': 'president' } })).json();
  assert.ok(ownNotifications.length); assert.ok(ownNotifications.every(row => row.recipientEmail === owner.email));
  const path = '/api/workflow/notifications/' + ownNotifications[0]._id + '/read';
  assert.equal((await fetch(base + path, { method: 'POST', headers: { 'x-test-role': 'pr' } })).status, 404);
  assert.equal((await fetch(base + path, { method: 'POST', headers: { 'x-test-role': 'president' } })).status, 200);
});
