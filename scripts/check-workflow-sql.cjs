// Real SQL integration check. All writes are inside one transaction that is always rolled back.
require('dotenv').config();
process.env.SQLSERVER_CONNECTION_TIMEOUT_MS = '30000';
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const db = require('../database');
const runtime = require('../database/runtime');
const models = require('../models');
const { WorkflowDefinition, WorkflowNotification } = require('../services/workflow-models');
const { createWorkflowEngine } = require('../services/workflow-engine');
const P = require('../services/workflow-policy');
async function main() {
  require('./sqlserver-migrate.cjs').targetGate();
  if (!db.isSqlProvider) throw new Error('This check requires the configured isolated SQL provider.');
  console.log('Connecting with the configured runtime SQL account.');
  const outer = new runtime.Session();
  try {
    await db.connect(); console.log('Connected; beginning rollback-only check.');
    await outer.begin();
    const suffix = crypto.randomUUID(), owner = { email: 'workflow-owner-' + suffix + '@example.test', role: 'president', assignments: [{ role: 'president', clubId: 1 }] };
    const reviewer = { admin: true, email: 'workflow-reviewer-' + suffix + '@example.test', assignments: [{ role: 'admin' }] };
    const config = P.validateDefinition({ name: 'Rollback-only QA', enabled: true, start: 'review', stages: [{ id: 'review', name: 'Review', roles: ['admin'], next: '', resubmit: 'review', approvalRule: 'any', permissions: { admin: ['approve', 'reject', 'request_changes', 'history', 'view_all'] }, editableFields: ['description'] }] }, 'event');
    await WorkflowDefinition.findOneAndUpdate({ type: 'event' }, { $set: { type: 'event', config, version: 999, updatedBy: reviewer.email } }, { upsert: true }).session(outer);
    console.log('Transactional definition saved.');
    const scopedDb = { async startSession() { return { transaction: outer.transaction, pending: outer.pending, withTransaction: fn => fn(), endSession: async () => {} }; } };
    const engine = createWorkflowEngine({ database: scopedDb, ...models, adminEmail: () => reviewer.email, publish: async () => {}, validatePatch: async () => {}, transport: () => null, env: {} });
    const club = (await runtime.request(outer).query('SELECT TOP (1) [id] FROM [dbo].[Club] WHERE [archivedAt] IS NULL ORDER BY [id];')).recordset[0];
    owner.assignments[0].clubId = Number(club.id);
    const id = Date.now() * 10 + crypto.randomInt(10);
    let record = (await engine.createNew('content', { id, clubId: Number(club.id), clubName: 'Workflow QA', type: 'event', title: 'Rollback-only test', description: 'Original', date: '2030-10-20', time: '10:00', location: 'Main hall' }, owner)).toObject();
    console.log('Transactional request submitted.');
    record = await engine.decide('content', id, reviewer, { revision: 1, action: 'request_changes', fields: ['description'], comment: 'Correct the English description.' });
    assert.equal(record.workflow.state, 'changes_requested');
    await assert.rejects(engine.resubmit('content', id, owner, { revision: 2, changes: { description: 'Corrected', date: '2031-01-01' } }), /locked/);
    record = await engine.resubmit('content', id, owner, { revision: 2, changes: { description: 'Corrected' } });
    assert.equal(record.date, '2030-10-20'); assert.equal(record.description, 'Corrected');
    record = await engine.decide('content', id, reviewer, { revision: 3, action: 'approve', comment: 'Approved.' });
    assert.equal(record.workflow.state, 'approved');
    assert.equal(await models.ContentRequest.countDocuments({ id }).session(outer), 1);
    assert.ok(await WorkflowNotification.countDocuments({ requestRef: String(id) }).session(outer) >= 4);
    console.log('PASS: SQL workflow submission, description-only revision, locked-field rejection, resubmission, approval, history and notifications.');
    const { CustomStaffRole } = require('../services/custom-staff-role-model');
    const customService = require('../services/custom-staff-roles').createCustomRoleService({ database: scopedDb, ...models });
    const staffEmail = 'workflow_qa_' + suffix.replaceAll('-', '') + '@miuegypt.edu.eg';
    const roleBody = { name: 'Rollback-only custom reviewer', description: 'SQL QA', enabled: true, scope: 'clubs', modules: ['requests', 'notifications'], requestTypes: ['event'], permissions: ['approve', 'request_changes', 'history', 'view_all'], members: [{ email: staffEmail, clubIds: [Number(club.id)] }] };
    const custom = await customService.save(null, roleBody, reviewer);
    const account = await models.ClubAccount.findOne({ email: staffEmail }).session(outer).lean();
    const decorated = await require('../services/custom-staff-access').decorateCustomStaff(account, outer);
    assert.equal(decorated.customRoles[0].key, custom.key);
    const customEngine = createWorkflowEngine({ database: scopedDb, ...models, customRoles: CustomStaffRole, adminEmail: () => reviewer.email, publish: async () => {}, validatePatch: async () => {}, transport: () => null, env: {} });
    const customConfig = { ...config, stages: [{ ...config.stages[0], roles: [custom.key], permissions: { [custom.key]: roleBody.permissions } }] };
    await customEngine.saveDefinition('event', reviewer, { version: 999, config: customConfig });
    let customRecord = (await customEngine.createNew('content', { id: id + 1, clubId: Number(club.id), clubName: 'Workflow QA', type: 'event', title: 'Custom role SQL QA', description: 'Custom role review' }, owner)).toObject();
    const staffActor = { email: staffEmail, role: custom.key, assignments: require('../services/staff-google-auth').staffRoleAssignments(decorated), customRoles: decorated.customRoles };
    customRecord = await customEngine.decide('content', id + 1, staffActor, { revision: 1, action: 'approve', comment: 'QA approval' });
    assert.equal(customRecord.workflow.state, 'approved');
    await customService.save(custom.key, { ...roleBody, version: 1, members: [] }, reviewer);
    assert.equal(await require('../services/custom-staff-access').decorateCustomStaff(await models.ClubAccount.findOne({ email: staffEmail }).session(outer).lean(), outer), null);
    console.log('PASS: SQL custom role creation, MIU staff provisioning, custom workflow routing/approval and access revocation.');
  } catch (error) {
    console.error('SQL workflow operation failed:', error.code || error.name, error.message);
    throw error;
  } finally {
    try { await outer.abortTransaction(); }
    catch (error) { console.error('Rollback connection error:', error.code || error.name); }
    finally { await db.disconnect(); }
    console.log('SQL integration connection closed; no transaction was committed.');
  }
}
main().catch(error => { console.error('Workflow SQL check failed:', error.code || error.name, error.message); process.exitCode = 1; });
