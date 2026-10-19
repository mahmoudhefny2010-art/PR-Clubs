const { CustomStaffRole } = require('./custom-staff-role-model');
const { isCustomRole } = require('./staff-role-keys');
const { staffRoleAssignments } = require('./staff-google-auth');
async function decorateCustomStaff(account, session, roles = CustomStaffRole) {
  if (!account) return account;
  const assignments = staffRoleAssignments(account), keys = assignments.map(item => item.role).filter(isCustomRole);
  if (!assignments.length && isCustomRole(account.role)) return null;
  if (!keys.length) return account;
  const customRoles = await roles.find({ key: { $in: keys }, enabled: true }).session(session).lean();
  const allowed = assignments.filter(item => !isCustomRole(item.role) || customRoles.some(role => role.key === item.role));
  if (!allowed.length) return null;
  const primary = allowed.find(item => item.role === account.role) || allowed[0];
  return { ...account, ...primary, roleAssignments: allowed, customRoles };
}
module.exports = { decorateCustomStaff };
