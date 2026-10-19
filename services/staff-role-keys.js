const builtinStaffRoles = ['president', 'vice_president', 'head', 'pr', 'english', 'security', 'sso', 'dean', 'supervisor', 'miu_events', 'software_development'];
const isCustomRole = value => typeof value === 'string' && /^custom_[a-z_]{1,30}$/.test(value);
const isStaffRole = value => builtinStaffRoles.includes(value) || isCustomRole(value);
const customDashboardUrl = key => '/dashboards/custom-role.html?role=' + encodeURIComponent(key);
module.exports = { builtinStaffRoles, isCustomRole, isStaffRole, customDashboardUrl };
