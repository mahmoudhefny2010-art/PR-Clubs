const { isCustomRole, customDashboardUrl } = require('./staff-role-keys');
const STAFF_ROUTES = {
  software_development: '/admin',
  miu_events: '/dashboards/miu-events-dashboard.html',
  president: '/club-dashboard', vice_president: '/club-dashboard', head: '/club-dashboard', supervisor: '/dashboards/supervisor-dashboard.html',
  pr: '/dashboards/pr-dashboard.html', english: '/dashboards/english-dashboard.html',
  security: '/dashboards/security-dashboard.html', sso: '/dashboards/sso-dashboard.html', dean: '/dashboards/dean-dashboard.html'
};

const STAFF_ROLE_LABELS = { president: 'Club president', vice_president: 'Club vice president', head: 'Committee head', supervisor: 'Club supervisor',
  pr: 'PR', english: 'English Department', security: 'Security Office', sso: 'SSO', dean: 'Dean',
  software_development: 'Software Development team', miu_events: 'MIU Events' };
const staffRoute = role => Object.hasOwn(STAFF_ROUTES, role) ? STAFF_ROUTES[role] : isCustomRole(role) ? customDashboardUrl(role) : null;

function staffRoleAssignments(account) {
  const assignments = Array.isArray(account?.roleAssignments) ? account.roleAssignments : [];
  const valid = assignments.filter(item => item && staffRoute(item.role)).map(item => ({
    role: item.role, clubId: Number(item.clubId) || 0,
    assignedClubIds: Array.isArray(item.assignedClubIds) ? item.assignedClubIds.map(Number).filter(Number.isSafeInteger) : [],
    committee: String(item.committee || '')
  }));
  if (valid.length) return valid;
  if (isCustomRole(account?.role)) return [];
  return account && staffRoute(account.role) ? [{ role: account.role, clubId: Number(account.clubId) || 0,
    assignedClubIds: Array.isArray(account.assignedClubIds) ? account.assignedClubIds.map(Number).filter(Number.isSafeInteger) : [],
    committee: String(account.committee || '') }] : [];
}

async function resolveStaffGoogleAccount(ClubAccount, identity, customDecorator = null) {
  // identity comes exclusively from the existing server-side Google token verifier.
  const account = await ClubAccount.findOne({ email: identity.email }).lean();
  if (!account) return null;
  if (!staffRoute(account.role)) throw new Error('STAFF_GOOGLE_ACCOUNT_CONFLICT');
  if (account.googleSub && account.googleSub !== identity.googleSub) throw new Error('STAFF_GOOGLE_ACCOUNT_CONFLICT');
  if (isCustomRole(account.role)) {
    customDecorator ||= require('./custom-staff-access').decorateCustomStaff;
    if (!await customDecorator(account)) return null;
  }
  const subjectOwner = await ClubAccount.findOne({ googleSub: identity.googleSub }).select('_id').lean();
  if (subjectOwner && String(subjectOwner._id) !== String(account._id)) throw new Error('STAFF_GOOGLE_ACCOUNT_CONFLICT');
  const saved = await ClubAccount.findOneAndUpdate({ _id: account._id, email: identity.email, role: account.role,
    $or: [{ googleSub: { $exists: false } }, { googleSub: null }, { googleSub: identity.googleSub }] },
    { $set: { googleSub: identity.googleSub } }, { new: true, runValidators: true }).lean();
  if (!saved || !staffRoute(saved.role)) throw new Error('STAFF_GOOGLE_ACCOUNT_CONFLICT');
  if (isCustomRole(saved.role)) {
    const active = await customDecorator(saved);
    if (!active) return null;
    return { account: active, redirect: staffRoute(active.role) };
  }
  return { account: saved, redirect: staffRoute(saved.role) };
}

async function resolveAdminGoogleAccount({ AdminAuthState, identity, configuredEmail, fallbackCredentials }) {
  if (!configuredEmail || identity.email !== configuredEmail.toLowerCase()) return null;
  let account = await AdminAuthState.findOne({ email: configuredEmail }).lean();
  if (!account) {
    const credentials = await fallbackCredentials();
    if (!credentials?.salt || !/^[a-f\d]{128}$/i.test(credentials.passwordHash || '')) throw new Error('STAFF_GOOGLE_ACCOUNT_CONFLICT');
    try {
      account = (await AdminAuthState.create({ email: configuredEmail, ...credentials, googleSub: identity.googleSub, sessionVersion: 0 })).toObject();
    } catch (error) {
      if (error.code !== 11000) throw error;
      account = await AdminAuthState.findOne({ email: configuredEmail }).lean();
    }
  }
  if (!account || account.googleSub && account.googleSub !== identity.googleSub) throw new Error('STAFF_GOOGLE_ACCOUNT_CONFLICT');
  const saved = await AdminAuthState.findOneAndUpdate({ _id: account._id, email: configuredEmail,
    $or: [{ googleSub: { $exists: false } }, { googleSub: null }, { googleSub: identity.googleSub }] },
    { $set: { googleSub: identity.googleSub } }, { new: true, runValidators: true }).lean();
  if (!saved) throw new Error('STAFF_GOOGLE_ACCOUNT_CONFLICT');
  return saved;
}

module.exports = { STAFF_ROUTES, STAFF_ROLE_LABELS, staffRoleAssignments, staffRoute, resolveStaffGoogleAccount, resolveAdminGoogleAccount };
