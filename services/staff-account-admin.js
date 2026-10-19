const crypto = require('crypto');
const { passwordInputError, hashAccountPassword, verifyAccountPasswordSaved } = require('./account-passwords');
const { STAFF_ROUTES, STAFF_ROLE_LABELS, staffRoleAssignments } = require('./staff-google-auth');
const ROLE_LABELS = STAFF_ROLE_LABELS;
const CLUB_ROLES = new Set(['president', 'vice_president', 'head', 'supervisor']);

function validateStaffAssignment(body) {
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const role = body.role;
  const ids = body.assignedClubIds;
  const committee = typeof body.committee === 'string' ? body.committee.trim() : '';
  if (!/^[a-z0-9._%+-]+@miuegypt\.edu\.eg$/i.test(email) || email.length > 254) return { error: 'Enter the staff member’s MIU Google email.' };
  if (!Object.hasOwn(STAFF_ROUTES, role)) return { error: 'Choose an available staff role.' };
  if (!Array.isArray(ids) || ids.length > 200 || ids.some(id => !Number.isSafeInteger(id) || id <= 0)
    || new Set(ids).size !== ids.length) return { error: 'Choose valid, unique clubs.' };
  if (CLUB_ROLES.has(role) && !ids.length) return { error: 'Select at least one club for this role.' };
  if (['president', 'vice_president', 'head'].includes(role) && ids.length !== 1) return { error: 'Select exactly one club for a president or committee head.' };
  if (!CLUB_ROLES.has(role) && ids.length) return { error: 'Committee dashboard roles do not use club assignments.' };
  if (role === 'head' && (!committee || committee.length > 100)) return { error: 'Enter the committee this head will manage (up to 100 characters).' };
  return { value: { email, role, clubId: ids[0] || 0, assignedClubIds: role === 'supervisor' ? ids : [], committee: role === 'head' ? committee : '' } };
}

function validateStaffAssignments(body) {
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const submitted = Array.isArray(body.assignments) ? body.assignments : [body];
  if (!submitted.length || submitted.length > Object.keys(STAFF_ROUTES).length) return { error: 'Add at least one dashboard role.' };
  const assignments = [];
  for (const item of submitted) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return { error: 'Choose valid dashboard assignments.' };
    const validated = validateStaffAssignment({ ...body, ...item, email });
    if (validated.error) return validated;
    assignments.push(validated.value);
  }
  if (new Set(assignments.map(item => item.role)).size !== assignments.length) return { error: 'Choose each dashboard role only once.' };
  const assignedClubIds = assignments.flatMap(item => item.role === 'supervisor'
    ? item.assignedClubIds : ['president', 'vice_president', 'head'].includes(item.role) ? [item.clubId] : []);
  if (new Set(assignedClubIds).size > 200) return { error: 'Choose no more than 200 clubs across dashboard assignments.' };
  const primary = assignments[0];
  return { value: { email, role: primary.role, clubId: primary.clubId, assignedClubIds: primary.assignedClubIds,
    committee: primary.committee, roleAssignments: assignments.map(({ role, clubId, assignedClubIds, committee }) => ({ role, clubId, assignedClubIds, committee })) } };
}

async function verifyStaffAssignmentsSaved(ClubAccount, email, expectedAssignments) {
  const persisted = await ClubAccount.findOne({ email }).read('primary').readConcern('majority').lean();
  const actualAssignments = persisted ? staffRoleAssignments(persisted) : [];
  if (!persisted || JSON.stringify(actualAssignments) !== JSON.stringify(expectedAssignments)) {
    throw new Error('STAFF_ASSIGNMENTS_SAVE_UNCONFIRMED');
  }
  return persisted;
}

async function countOtherSoftwareDevelopmentAccounts(ClubAccount, email) {
  const query = ClubAccount.countDocuments({ email: { $ne: email }, $or: [
    { role: 'software_development' }, { roleAssignments: { $elemMatch: { role: 'software_development' } } }
  ] });
  return query.read('primary').readConcern('majority');
}

function registerStaffAccountAdmin(app, { ClubAccount, Club, databaseReady, sameOrigin, refreshAccount, removeAccount = () => {}, isAdminEmail = () => false }) {
  const publicAccount = account => ({ email: account.email, role: account.role, clubId: account.clubId,
    committee: account.committee || '', assignedClubIds: account.role === 'supervisor' ? account.assignedClubIds || []
      : ['president', 'vice_president', 'head'].includes(account.role) ? [account.clubId] : [], assignments: staffRoleAssignments(account),
    isGlobalAdmin: staffRoleAssignments(account).some(item => item.role === 'software_development'),
    updatedAt: account.updatedAt || null });
  app.get('/api/admin/staff-accounts', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!databaseReady()) return res.status(503).json({ message: 'Staff accounts are temporarily unavailable.' });
    try {
      if (typeof req.query.email === 'string') {
        const email = req.query.email.trim().toLowerCase();
        if (!/^[a-z0-9._%+-]+@miuegypt\.edu\.eg$/i.test(email) || email.length > 254) {
          return res.status(400).json({ message: 'Enter a valid MIU Google email.' });
        }
        const account = await ClubAccount.findOne({ email }).select('email role roleAssignments clubId assignedClubIds committee updatedAt')
          .read('primary').readConcern('majority').lean();
        const hasRoles = account && staffRoleAssignments(account).length > 0;
        return res.json({ account: hasRoles ? publicAccount(account) : null });
      }
      const [storedAccounts, clubs] = await Promise.all([
        ClubAccount.find({}).select('email role roleAssignments clubId assignedClubIds committee updatedAt')
          .read('primary').readConcern('majority').sort({ updatedAt: -1, email: 1 }).lean(),
        Club.find({ archivedAt: null }).select('id name').sort({ name: 1 }).lean()
      ]);
      const accounts = storedAccounts.filter(account => staffRoleAssignments(account).length > 0);
      res.json({ accounts: accounts.map(publicAccount), clubs, roles: ROLE_LABELS });
    } catch { res.status(503).json({ message: 'Could not load staff accounts. Please try again.' }); }
  });
  app.put('/api/admin/staff-accounts', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!sameOrigin(req)) return res.status(403).json({ message: 'Reload and try again.' });
    if (!databaseReady()) return res.status(503).json({ message: 'Staff accounts are temporarily unavailable.' });
    const validated = validateStaffAssignments(req.body || {});
    if (validated.error) return res.status(400).json({ message: validated.error });
    const passwordError = passwordInputError(req.body);
    if (passwordError) return res.status(400).json({ message: passwordError });
    const value = validated.value;
    let writeAcknowledged = false;
    try {
      const ids = [...new Set(value.roleAssignments.flatMap(item => item.role === 'supervisor'
        ? item.assignedClubIds : ['president', 'vice_president', 'head'].includes(item.role) ? [item.clubId] : []))];
      if (ids.length && await Club.countDocuments({ id: { $in: ids }, archivedAt: null }) !== ids.length) {
        return res.status(400).json({ message: 'Select existing, active clubs.' });
      }
      const existing = await ClubAccount.findOne({ email: value.email }).read('primary').readConcern('majority').lean();
      // Custom assignments are edited in the role builder; built-in staff edits preserve them.
      value.roleAssignments.push(...staffRoleAssignments(existing).filter(item => require('./staff-role-keys').isCustomRole(item.role)));
      if (staffRoleAssignments(existing).some(item => item.role === 'software_development')
        && !value.roleAssignments.some(item => item.role === 'software_development')
        && await countOtherSoftwareDevelopmentAccounts(ClubAccount, value.email) < 1) {
        return res.status(409).json({ message: 'Keep at least one Software Development administrator account assigned before removing this role.' });
      }
      const passwordFields = req.body.password ? await hashAccountPassword(req.body.password) : {};
      let saved;
      if (existing) {
        const currentSessionVersion = Number.isSafeInteger(Number(existing.sessionVersion)) ? Number(existing.sessionVersion) : 0;
        const versionMatch = [{ sessionVersion: currentSessionVersion }];
        if (existing.sessionVersion == null) versionMatch.push({ sessionVersion: { $exists: false } }, { sessionVersion: null });
        const accountVersionFilter = { _id: existing._id, email: value.email, $or: versionMatch };
        if (existing.sessionVersion != null) accountVersionFilter.sessionVersion = currentSessionVersion;
        saved = await ClubAccount.findOneAndUpdate(accountVersionFilter,
          { $set: { ...value, ...passwordFields }, $inc: { sessionVersion: 1 } }, { new: true, runValidators: true, writeConcern: { w: 'majority' } }).lean();
        if (!saved) return res.status(409).json({ message: 'This account changed while saving. Reload its current roles and try again.' });
        writeAcknowledged = true;
      } else {
        const secret = crypto.randomBytes(48).toString('base64url');
        const credentials = req.body.password ? passwordFields : await hashAccountPassword(secret);
        const created = await ClubAccount.create({ ...value, ...credentials, sessionVersion: 0 }, { writeConcern: { w: 'majority' } });
        saved = created.toObject();
        writeAcknowledged = true;
      }
      if (req.body.password) saved = await verifyAccountPasswordSaved(ClubAccount, saved, req.body.password);
      const verified = await verifyStaffAssignmentsSaved(ClubAccount, value.email, value.roleAssignments);
      if (Number(verified.sessionVersion || 0) !== Number(saved.sessionVersion || 0)) {
        throw new Error('STAFF_ASSIGNMENTS_SAVE_UNCONFIRMED');
      }
      refreshAccount(verified);
      const message = req.body.password
          ? 'Account saved and verified in the database; the password was checked. Sign in with the new password or MIU Google.'
          : 'Dashboard role saved and verified in the database. Use MIU Google or the existing password; no new password was set.';
      res.json({ ...publicAccount(verified), savedToDatabase: true, passwordUpdated: Boolean(req.body.password), message });
    } catch (error) {
      res.status(error.code === 11000 ? 409 : 503).json({ message: writeAcknowledged
        ? 'MongoDB acknowledged the write, but the final account state could not be verified. Reload the account before retrying.'
        : 'The staff role was not confirmed as saved. Check the connection and try again.' });
    }
  });
  app.delete('/api/admin/staff-accounts', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!sameOrigin(req)) return res.status(403).json({ message: 'Reload and try again.' });
    if (!databaseReady()) return res.status(503).json({ message: 'Staff accounts are temporarily unavailable.' });
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    if (!/^[a-z0-9._%+-]+@miuegypt\.edu\.eg$/i.test(email) || email.length > 254) {
      return res.status(400).json({ message: 'Enter a valid MIU Google email.' });
    }
    try {
      const account = await ClubAccount.findOne({ email }).read('primary').lean();
      if (!account || !staffRoleAssignments(account).length) return res.status(404).json({ message: 'No saved staff dashboard roles match this email.' });
      if (staffRoleAssignments(account).some(item => item.role === 'software_development')
        && await countOtherSoftwareDevelopmentAccounts(ClubAccount, email) < 1) {
        return res.status(409).json({ message: 'Assign Software Development to another account before deleting this one.' });
      }
      const result = await ClubAccount.deleteOne({ _id: account._id, email }, { writeConcern: { w: 'majority' } });
      if (result.deletedCount !== 1) return res.status(409).json({ message: 'The account changed. Reload the staff list and try again.' });
      const remaining = await ClubAccount.findOne({ _id: account._id }).read('primary').readConcern('majority').select('_id').lean();
      if (remaining) return res.status(503).json({ message: 'MongoDB acknowledged deletion, but it could not be verified. Reload before retrying.' });
      removeAccount(account);
      return res.json({ email, deletedFromDatabase: true, message: 'Staff dashboard roles were deleted and verified in the database.' });
    } catch {
      return res.status(503).json({ message: 'The account deletion could not be confirmed. Reload before retrying.' });
    }
  });
}

module.exports = { ROLE_LABELS, validateStaffAssignment, validateStaffAssignments, registerStaffAccountAdmin };
