const crypto = require('node:crypto');
const P = require('./workflow-policy');
const { isCustomRole, customDashboardUrl } = require('./staff-role-keys');
const { staffRoleAssignments } = require('./staff-google-auth');
const { hashAccountPassword } = require('./account-passwords');
const { CustomStaffRole } = require('./custom-staff-role-model');
const modules = ['requests', 'notifications'];
function validateRole(body) {
  if (!body || typeof body !== 'object') P.fail(422, 'Enter the role details.');
  const name = P.clean(body.name, 81), description = P.clean(body.description, 301);
  if (!name || name.length > 80 || description.length > 300) P.fail(422, 'Enter a role name up to 80 characters and a short description.');
  if (!['global', 'clubs'].includes(body.scope)) P.fail(422, 'Choose the clubs this role can access.');
  const list = (key, allowed) => {
    if (!Array.isArray(body[key]) || body[key].some(item => !allowed.includes(item))) P.fail(422, `Choose valid ${key}.`);
    return [...new Set(body[key])];
  };
  const value = { name, description, enabled: body.enabled !== false, scope: body.scope,
    requestTypes: list('requestTypes', P.types), permissions: list('permissions', P.actions), modules: list('modules', modules) };
  if (!value.modules.length || value.modules.includes('requests') && !value.requestTypes.length) P.fail(422, 'Select dashboard tools and at least one request type for the request inbox.');
  if (value.permissions.length && !value.modules.includes('requests')) P.fail(422, 'Enable the request inbox before assigning review permissions.');
  if (!Array.isArray(body.members) || body.members.length > 200) P.fail(422, 'Assign up to 200 staff members.');
  const members = body.members.map(member => {
    const email = P.clean(member?.email, 255).toLowerCase(), clubIds = member?.clubIds;
    if (!/^[a-z0-9._%+-]+@miuegypt\.edu\.eg$/.test(email) || email.length > 254) P.fail(422, 'Use each staff member’s MIU Google email.');
    if (!Array.isArray(clubIds) || clubIds.length > 200 || clubIds.some(id => !Number.isSafeInteger(id) || id < 1)) P.fail(422, 'Choose valid clubs for each staff member.');
    if (body.scope === 'clubs' && !clubIds.length || body.scope === 'global' && clubIds.length) P.fail(422, 'Club access must match the selected role scope.');
    return { email, clubIds: [...new Set(clubIds)] };
  });
  if (new Set(members.map(member => member.email)).size !== members.length) P.fail(422, 'Choose each email only once.');
  return { value, members };
}
function createCustomRoleService({ database, ClubAccount, Club, AuditLog, roles = CustomStaffRole, refreshAccount = () => {}, removeAccount = () => {} }) {
  async function transaction(fn) { const session = await database.startSession(); try { let result; await session.withTransaction(async () => { result = await fn(session); }); return result; } finally { await session.endSession(); } }
  async function list() {
    const [definitions, accounts, clubs] = await Promise.all([
      roles.find().sort({ name: 1 }).lean(), ClubAccount.find().select('email role roleAssignments clubId assignedClubIds committee').lean(), Club.find({ archivedAt: null }).select('id name').sort({ name: 1 }).lean()
    ]);
    return { roles: definitions.map(role => ({ ...role, dashboardUrl: customDashboardUrl(role.key), members: accounts.flatMap(account => staffRoleAssignments(account).filter(item => item.role === role.key).map(item => ({ email: account.email, clubIds: role.scope === 'clubs' ? item.assignedClubIds : [] }))) })), clubs, types: P.types, permissions: P.actions, modules };
  }
  async function save(key, body, actor) {
    if (!actor?.admin) P.fail(403, 'Only an administrator can manage roles.');
    if (key && !isCustomRole(key)) P.fail(404, 'Role not found.');
    const { value, members } = validateRole(body), changed = [], removed = [];
    const result = await transaction(async session => {
      changed.length = 0; removed.length = 0;
      const previous = key ? await roles.findOne({ key }).session(session).lean() : null;
      if (key && !previous) P.fail(404, 'Role not found.');
      if (previous && body.version !== previous.version) P.fail(409, 'This role changed. Reload before saving.');
      const ids = [...new Set(members.flatMap(member => member.clubIds))];
      if (ids.length && await Club.countDocuments({ id: { $in: ids }, archivedAt: null }).session(session) !== ids.length) P.fail(422, 'Choose existing, active clubs.');
      const roleKey = key || 'custom_' + [...crypto.randomBytes(16)].map(byte => String.fromCharCode(97 + byte % 26)).join('');
      const version = (previous?.version || 0) + 1;
      let saved;
      if (previous) saved = await roles.findOneAndUpdate({ key, version: previous.version }, { $set: { ...value, updatedBy: actor.email }, $inc: { version: 1 } }, { new: true, runValidators: true }).session(session).lean();
      else [saved] = await roles.create([{ ...value, key: roleKey, version, updatedBy: actor.email }], { session });
      if (!saved) P.fail(409, 'This role changed. Reload before saving.');
      const accounts = await ClubAccount.find().session(session).lean();
      const candidates = new Set([...members.map(member => member.email), ...accounts.filter(account => staffRoleAssignments(account).some(item => item.role === roleKey)).map(account => account.email)]);
      for (const email of candidates) {
        const account = accounts.find(item => item.email === email), member = members.find(item => item.email === email);
        const accountMatch = account ? { _id: account._id, ...(account.sessionVersion == null
          ? { $or: [{ sessionVersion: 0 }, { sessionVersion: null }, { sessionVersion: { $exists: false } }] }
          : { sessionVersion: account.sessionVersion }) } : null;
        const assignments = staffRoleAssignments(account).filter(item => item.role !== roleKey);
        if (member) assignments.push({ role: roleKey, clubId: member.clubIds[0] || 0, assignedClubIds: member.clubIds, committee: '' });
        if (!assignments.length) {
          // Keep credentials and Google binding, but invalidate the removed dashboard session.
          if (account) {
            const revoked = await ClubAccount.findOneAndUpdate(accountMatch, { $set: { roleAssignments: [], assignedClubIds: [] }, $inc: { sessionVersion: 1 } }, { new: true, runValidators: true }).session(session).lean();
            if (!revoked) P.fail(409, 'A staff account changed. Reload before removing its role.');
            removed.push(account);
          }
          continue;
        }
        const primary = assignments.find(item => item.role === account?.role) || assignments[0];
        const accountFields = { ...primary, roleAssignments: assignments };
        if (account && JSON.stringify(staffRoleAssignments(account)) === JSON.stringify(assignments)) continue;
        if (account) {
          const savedAccount = await ClubAccount.findOneAndUpdate(accountMatch, { $set: accountFields, $inc: { sessionVersion: 1 } }, { new: true, runValidators: true }).session(session).lean();
          if (!savedAccount) P.fail(409, 'A staff account changed. Reload before saving.');
          changed.push(savedAccount);
        } else {
          const credentials = await hashAccountPassword(crypto.randomBytes(48).toString('base64url'));
          const [savedAccount] = await ClubAccount.create([{ email, ...accountFields, ...credentials, sessionVersion: 0 }], { session });
          changed.push(savedAccount.toObject());
        }
      }
      await AuditLog.create([{ id: Date.now() * 1000 + crypto.randomInt(1000), actorEmail: actor.email, actorRole: 'admin', action: 'custom_staff_role_saved', targetType: 'CustomStaffRole', targetId: roleKey, targetName: value.name,
        details: JSON.stringify({ before: previous, after: value, assignedEmails: members.map(member => member.email), removedEmails: removed.map(account => account.email), version }) }], { session });
      return { key: roleKey, version, dashboardUrl: customDashboardUrl(roleKey) };
    });
    changed.forEach(refreshAccount); removed.forEach(removeAccount); return result;
  }
  return { list, save, roles };
}
module.exports = { validateRole, createCustomRoleService, modules };
