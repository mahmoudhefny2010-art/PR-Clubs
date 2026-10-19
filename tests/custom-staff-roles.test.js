const test = require('node:test'), assert = require('node:assert/strict'), crypto = require('node:crypto');
const V = require('../database/values'), P = require('../services/workflow-policy');
const { createCustomRoleService, validateRole } = require('../services/custom-staff-roles');
const { decorateCustomStaff } = require('../services/custom-staff-access');
const { staffRoleAssignments, staffRoute } = require('../services/staff-google-auth');
const admin = { admin: true, email: 'admin@miuegypt.edu.eg' };
const body = () => ({ name: 'Activities team', description: 'Review campus events', enabled: true, scope: 'clubs', modules: ['requests', 'notifications'], requestTypes: ['event'], permissions: ['approve', 'request_changes', 'history', 'view_all'], members: [{ email: 'reviewer@miuegypt.edu.eg', clubIds: [1] }] });
function fixture() {
  const stores = [], flags = {};
  function model(audit = false) {
    const store = { rows: [] }; stores.push(store);
    const query = fn => ({ session() { return this; }, select() { return this; }, sort() { return this; }, lean: async () => structuredClone(fn()), then(resolve, reject) { return this.lean().then(resolve, reject); } });
    return class Model {
      constructor(value) { Object.assign(this, structuredClone(value)); this._id ||= crypto.randomBytes(12).toString('hex'); }
      toObject() { return structuredClone({ ...this }); }
      static async create(values) { if (audit && flags.failAudit) throw Error('Audit unavailable'); const rows = (Array.isArray(values) ? values : [values]).map(value => new this(value)); store.rows.push(...rows.map(row => row.toObject())); return Array.isArray(values) ? rows : rows[0]; }
      static find(filter = {}) { return query(() => store.rows.filter(row => V.matches(row, filter))); }
      static findOne(filter) { return query(() => store.rows.find(row => V.matches(row, filter)) || null); }
      static countDocuments(filter) { return query(() => store.rows.filter(row => V.matches(row, filter)).length); }
      static findOneAndUpdate(filter, patch) { return query(() => { const row = store.rows.find(row => V.matches(row, filter)); if (!row) return null; Object.assign(row, V.update(row, patch)); return row; }); }
      static updateOne(filter, patch) { return this.findOneAndUpdate(filter, patch); }
      static get rows() { return store.rows; }
    };
  }
  const roles = model(), ClubAccount = model(), Club = model(), AuditLog = model(true);
  let lock = Promise.resolve();
  const database = { startSession: async () => ({ withTransaction: async fn => { const previous = lock; let release; lock = new Promise(resolve => release = resolve); await previous;
    const saved = stores.map(store => structuredClone(store.rows)); try { return await fn(); } catch (error) { stores.forEach((store, index) => store.rows = saved[index]); throw error; } finally { release(); }
  }, endSession: async () => {} }) };
  void Club.create({ id: 1, name: 'MUN', archivedAt: null }); void Club.create({ id: 2, name: 'IEEE', archivedAt: null });
  const service = createCustomRoleService({ database, roles, ClubAccount, Club, AuditLog });
  return { service, roles, ClubAccount, Club, AuditLog, flags };
}
test('custom role validation rejects arbitrary administrative powers, invalid scopes, emails and club assignments', () => {
  for (const update of [{ permissions: ['manage_admins'] }, { scope: 'anything' }, { members: [{ email: 'outside@example.test', clubIds: [1] }] }, { members: [{ email: 'a@miuegypt.edu.eg', clubIds: [] }] }, { modules: ['execute_code'] }, { requestTypes: ['users'] }]) assert.throws(() => validateRole({ ...body(), ...update }), P.WorkflowError);
});
test('creating a role builds a unique dashboard, securely provisions MIU staff and audits the transaction', async () => {
  const f = fixture(), saved = await f.service.save(null, body(), admin);
  assert.match(saved.key, /^custom_[a-z_]+$/); assert.equal(saved.dashboardUrl, staffRoute(saved.key));
  assert.equal(f.roles.rows[0].name, 'Activities team'); assert.equal(f.ClubAccount.rows[0].role, saved.key);
  assert.ok(f.ClubAccount.rows[0].salt && f.ClubAccount.rows[0].passwordHash); assert.equal(f.AuditLog.rows.length, 1);
  const account = await decorateCustomStaff(f.ClubAccount.rows[0], null, f.roles);
  assert.equal(account.customRoles[0].key, saved.key); assert.deepEqual(staffRoleAssignments(account)[0].assignedClubIds, [1]);
  assert.equal((await f.service.list()).roles[0].members[0].email, body().members[0].email);
});
test('assigning or removing a custom role preserves existing built-in roles, credentials and club scopes', async () => {
  const f = fixture(); await f.ClubAccount.create({ email: body().members[0].email, role: 'pr', roleAssignments: [{ role: 'pr', clubId: 0, assignedClubIds: [], committee: '' }], sessionVersion: 3, salt: 'original', passwordHash: 'original-hash' });
  const created = await f.service.save(null, body(), admin);
  assert.deepEqual(staffRoleAssignments(f.ClubAccount.rows[0]).map(item => item.role), ['pr', created.key]);
  assert.equal(f.ClubAccount.rows[0].passwordHash, 'original-hash');
  await f.service.save(created.key, { ...body(), version: 1, members: [] }, admin);
  assert.deepEqual(staffRoleAssignments(f.ClubAccount.rows[0]).map(item => item.role), ['pr']);
  assert.equal(f.ClubAccount.rows[0].salt, 'original'); assert.equal(f.ClubAccount.rows[0].sessionVersion, 5);
});

test('legacy staff records without a stored session counter can receive a custom role safely', async () => {
  const f = fixture(); await f.ClubAccount.create({ email: body().members[0].email, role: 'pr', clubId: 0, salt: 'legacy', passwordHash: 'retained' });
  const created = await f.service.save(null, body(), admin);
  assert.deepEqual(staffRoleAssignments(f.ClubAccount.rows[0]).map(item => item.role), ['pr', created.key]);
  assert.equal(f.ClubAccount.rows[0].sessionVersion, 1); assert.equal(f.ClubAccount.rows[0].passwordHash, 'retained');
});
test('removing the only role or disabling it prevents an old custom session from regaining fallback access', async () => {
  const f = fixture(), created = await f.service.save(null, body(), admin);
  await f.service.save(created.key, { ...body(), version: 1, enabled: false }, admin);
  assert.equal(await decorateCustomStaff(f.ClubAccount.rows[0], null, f.roles), null);
  await f.service.save(created.key, { ...body(), version: 2, members: [] }, admin);
  assert.deepEqual(staffRoleAssignments(f.ClubAccount.rows[0]), []);
  assert.equal(await decorateCustomStaff(f.ClubAccount.rows[0], null, f.roles), null);
});
test('role writes require admin, use version checks and roll back both grants and definitions when audit fails', async () => {
  const f = fixture(); await assert.rejects(f.service.save(null, body(), { email: 'staff@miuegypt.edu.eg' }), /administrator/);
  f.flags.failAudit = true; await assert.rejects(f.service.save(null, body(), admin), /Audit unavailable/);
  assert.equal(f.roles.rows.length, 0); assert.equal(f.ClubAccount.rows.length, 0);
  f.flags.failAudit = false; const saved = await f.service.save(null, body(), admin);
  await assert.rejects(f.service.save(saved.key, { ...body(), version: 99 }, admin), /changed/);
  await assert.rejects(f.service.save(saved.key, { ...body(), version: 1, members: [{ email: 'staff@miuegypt.edu.eg', clubIds: [999] }] }, admin), /active clubs/);
  assert.equal(f.roles.rows[0].version, 1);
});
test('custom reviewers are limited by live role permissions, club scope, request type and configured workflow stage', () => {
  const key = 'custom_review'; const role = { ...body(), key };
  const actor = { email: 'reviewer@miuegypt.edu.eg', assignments: [{ role: key, assignedClubIds: [1] }], customRoles: [role] };
  const config = P.defaults('event'); config.stages[0].roles = [key]; config.stages[0].permissions = { [key]: ['approve', 'request_changes', 'history', 'view_all'] };
  assert.throws(() => P.validateDefinition(config, 'event'), /eligible roles/);
  P.validateDefinition(config, 'event', [role]);
  const record = { clubId: 1, type: 'event', workflow: { definition: config, stageId: 'supervisor', state: 'review', ownerEmail: 'another@miuegypt.edu.eg' } };
  assert.equal(P.authorize(actor, record, 'approve').role, key);
  assert.throws(() => P.authorize(actor, record, 'reject'), /not permitted/);
  assert.equal(P.mayView(actor, { ...record, clubId: 2 }), false);
  assert.equal(P.mayView(actor, { ...record, type: 'feed', workflow: { ...record.workflow, definition: { ...config, type: 'feed' } } }), false);
  role.permissions = ['history']; assert.throws(() => P.authorize(actor, record, 'approve'), /not permitted/);
  role.enabled = false; assert.equal(P.mayView(actor, record), false);
});

test('HTTP role management is admin-only and direct dashboard/module APIs enforce assignments and selected tools', async t => {
  const express = require('express'), f = fixture();
  const saved = await f.service.save(null, { ...body(), modules: ['requests'] }, admin);
  const app = express(); app.use(express.json());
  const actorFor = async req => {
    if (req.get('x-test-actor') === 'admin') return admin;
    if (req.get('x-test-actor') !== 'staff') return null;
    const account = await decorateCustomStaff(f.ClubAccount.rows[0], null, f.roles);
    return account ? { email: account.email, role: account.role, assignments: staffRoleAssignments(account), customRoles: account.customRoles } : null;
  };
  const requireAdmin = (req, res, next) => req.get('x-test-actor') === 'admin' ? next() : res.status(403).json({ message: 'Admin required' });
  require('../services/custom-staff-role-routes').registerCustomStaffRoleRoutes(app, { service: f.service, actorFor, requireAdmin, ready: async () => true, sameOrigin: () => true, root: require('node:path').resolve(__dirname, '..') });
  require('../services/workflow-routes').registerWorkflowRoutes(app, { engine: {}, actorFor, requireAdmin, ready: async () => true, sameOrigin: () => true });
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve)); t.after(() => new Promise(resolve => server.close(resolve)));
  const call = (path, actor = 'staff', method = 'GET', data) => fetch('http://127.0.0.1:' + server.address().port + path, { method, headers: { 'Content-Type': 'application/json', 'x-test-actor': actor }, ...(data ? { body: JSON.stringify(data) } : {}) });
  assert.equal((await call('/api/admin/custom-roles')).status, 403);
  assert.equal((await call('/api/admin/custom-roles', 'staff', 'POST', body())).status, 403);
  assert.equal((await call('/api/admin/custom-roles', 'admin')).status, 200);
  assert.equal((await call('/api/custom-dashboard/' + saved.key, '')).status, 401);
  const context = await (await call('/api/custom-dashboard/' + saved.key)).json(); assert.equal(context.name, body().name); assert.deepEqual(context.modules, ['requests']);
  assert.equal((await call('/api/custom-dashboard/custom_someone_else')).status, 403);
  assert.equal((await call('/api/workflow/notifications')).status, 403);
  await f.service.save(saved.key, { ...body(), version: 1, modules: ['notifications'], permissions: [], requestTypes: [] }, admin);
  assert.equal((await call('/api/workflow/requests')).status, 403);
  assert.equal((await call('/api/workflow/requests/content/1/decision', 'staff', 'POST', { action: 'approve' })).status, 403);
  await f.service.save(saved.key, { ...body(), version: 2, members: [] }, admin);
  assert.equal((await call('/api/custom-dashboard/' + saved.key)).status, 401);
});
