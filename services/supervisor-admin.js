const crypto = require('crypto');
const { passwordInputError, hashAccountPassword, verifyAccountPasswordSaved } = require('./account-passwords');
const { staffRoleAssignments } = require('./staff-google-auth');

async function readPersistedAccount(ClubAccount, email) {
  const query = ClubAccount.findOne({ email });
  return typeof query.lean === 'function' ? query.lean() : query;
}

async function verifyAssignments(ClubAccount, email, expected) {
  const account = await readPersistedAccount(ClubAccount, email);
  const actual = account ? staffRoleAssignments(account) : [];
  const normalize = items => items.map(item => ({ role: item.role, clubId: Number(item.clubId) || 0,
    assignedClubIds: Array.isArray(item.assignedClubIds) ? item.assignedClubIds.map(Number) : [], committee: item.committee || '' }));
  if (!account || JSON.stringify(normalize(actual)) !== JSON.stringify(normalize(expected))) throw new Error('SUPERVISOR_SAVE_UNCONFIRMED');
  return account;
}

function registerSupervisorAdmin(app, { ClubAccount, StudentAccount, Club, databaseReady, sameOrigin, refreshAccount, removeAccount = () => {}, isAdminEmail = () => false }) {
  app.delete('/api/admin/supervisors', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!sameOrigin(req)) return res.status(403).json({ message: 'Reload and try again.' });
    if (!databaseReady()) return res.status(503).json({ message: 'Database is temporarily unavailable.' });
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return res.status(400).json({ message: 'Choose a valid supervisor account.' });
    if (isAdminEmail(email)) return res.status(403).json({ message: 'The administrator account cannot be deleted here.' });
    let writeAcknowledged = false;
    try {
      const account = await ClubAccount.findOne({ email }).lean();
      if (!account) return res.status(404).json({ message: 'Supervisor account not found. Reload the list.' });
      const assignments = staffRoleAssignments(account);
      if (!assignments.some(item => item.role === 'supervisor')) return res.status(404).json({ message: 'Supervisor account not found. Reload the list.' });
      const remaining = assignments.filter(item => item.role !== 'supervisor');
      if (remaining.length) {
        const primary = remaining[0];
        const saved = await ClubAccount.findOneAndUpdate({ _id: account._id, sessionVersion: account.sessionVersion || 0 }, {
          $set: { role: primary.role, clubId: primary.clubId, assignedClubIds: primary.assignedClubIds, committee: primary.committee, roleAssignments: remaining },
          $inc: { sessionVersion: 1 }
        }, { new: true, runValidators: true, writeConcern: { w: 'majority' } }).lean();
        if (!saved) return res.status(409).json({ message: 'This account changed. Reload the list.' });
        writeAcknowledged = true;
        const verified = await verifyAssignments(ClubAccount, email, remaining);
        if (Number(verified.sessionVersion || 0) !== Number(saved.sessionVersion || 0)) throw new Error('SUPERVISOR_SAVE_UNCONFIRMED');
        refreshAccount(verified);
        return res.json({ deleted: true, accountDeleted: false, savedToDatabase: true, email });
      }
      const deleted = await ClubAccount.findOneAndDelete({ _id: account._id, sessionVersion: account.sessionVersion || 0 }, { writeConcern: { w: 'majority' } });
      if (!deleted) return res.status(409).json({ message: 'This account changed. Reload the list.' });
      writeAcknowledged = true;
      if (await readPersistedAccount(ClubAccount, email)) throw new Error('SUPERVISOR_DELETE_UNCONFIRMED');
      removeAccount(email);
      res.json({ deleted: true, accountDeleted: true, savedToDatabase: true, email });
    } catch { res.status(503).json({ message: writeAcknowledged
      ? 'MongoDB acknowledged the change, but its final state could not be verified. Reload before retrying.'
      : 'The supervisor account change was not confirmed. Reload before retrying.' }); }
  });
  app.get('/api/admin/supervisors', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!databaseReady()) return res.status(503).json({ message: 'Database is temporarily unavailable.' });
    try {
      const [accounts, clubs] = await Promise.all([
        ClubAccount.find({ $or: [{ role: 'supervisor' }, { 'roleAssignments.role': 'supervisor' }] })
          .select('email role roleAssignments clubId assignedClubIds').lean(),
        Club.find({}).select('id name').lean()
      ]);
      res.json({ accounts: accounts.map(account => ({ email: account.email,
        assignedClubIds: staffRoleAssignments(account).find(item => item.role === 'supervisor')?.assignedClubIds || [] })), clubs });
    } catch { res.status(503).json({ message: 'Could not load supervisor assignments.' }); }
  });
  app.put('/api/admin/supervisors', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!sameOrigin(req)) return res.status(403).json({ message: 'Reload and try again.' });
    if (!databaseReady()) return res.status(503).json({ message: 'Database is temporarily unavailable.' });
    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const ids = req.body.assignedClubIds;
    const passwordError = passwordInputError(req.body);
    if (passwordError) return res.status(400).json({ message: passwordError });
    if (Array.isArray(ids) && ids.length === 0) return res.status(400).json({ message: 'Select at least one club for this supervisor.' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254
      || !Array.isArray(ids) || ids.length > 200 || ids.some(id => !Number.isSafeInteger(id) || id <= 0)
      || new Set(ids).size !== ids.length) return res.status(400).json({ message: 'Enter a valid email and unique club assignments.' });
    let writeAcknowledged = false;
    try {
      const account = await ClubAccount.findOne({ email });
      const googleOnly = /^[^\s@]+@miuegypt\.edu\.eg$/i.test(email) && !req.body.password;
      if (!account && !googleOnly && await StudentAccount.exists({ email })) {
        return res.status(409).json({ message: 'This email belongs to another account role.' });
      }
      if (await Club.countDocuments({ id: { $in: ids } }) !== ids.length) {
        return res.status(400).json({ message: 'One or more selected clubs no longer exist.' });
      }
      let saved;
      const passwordFields = req.body.password ? await hashAccountPassword(req.body.password) : {};
      if (account) {
        // Assignment changes revoke existing sessions; the next login uses fresh assignments.
        const assignments = staffRoleAssignments(account);
        const supervisorAssignment = { role: 'supervisor', assignedClubIds: ids, clubId: ids[0] || 0, committee: '' };
        const updatedAssignments = assignments.some(item => item.role === 'supervisor')
          ? assignments.map(item => item.role === 'supervisor' ? supervisorAssignment : item)
          : [...assignments, supervisorAssignment];
        const primary = updatedAssignments[0];
        saved = await ClubAccount.findOneAndUpdate({ _id: account._id, sessionVersion: account.sessionVersion || 0 },
          { $set: { role: primary.role, clubId: primary.clubId, assignedClubIds: primary.assignedClubIds,
            committee: primary.committee, roleAssignments: updatedAssignments,
            ...(primary.role === 'supervisor' ? { assignedClubIds: ids, clubId: ids[0] || 0 } : {}), ...passwordFields }, $inc: { sessionVersion: 1 } },
          { new: true, runValidators: true, writeConcern: { w: 'majority' } });
        writeAcknowledged = Boolean(saved);
      } else {
        const password = googleOnly ? crypto.randomBytes(48).toString('base64url') : req.body.password;
        if (typeof password !== 'string' || password.length < 12 || password.length > 200) {
          return res.status(400).json({ message: 'Use a password between 12 and 200 characters, or leave it empty for MIU Google sign-in.' });
        }
        const credentials = req.body.password ? passwordFields : await hashAccountPassword(password);
        saved = await ClubAccount.create({ email, role: 'supervisor', assignedClubIds: ids,
          clubId: ids[0] || 0, roleAssignments: [{ role: 'supervisor', assignedClubIds: ids, clubId: ids[0] || 0, committee: '' }], ...credentials },
        { writeConcern: { w: 'majority' } });
        writeAcknowledged = true;
      }
      if (!saved) return res.status(409).json({ message: 'Account changed. Reload and try again.' });
      const expectedAssignments = account
        ? (staffRoleAssignments(account).some(item => item.role === 'supervisor')
          ? staffRoleAssignments(account).map(item => item.role === 'supervisor'
            ? { role: 'supervisor', assignedClubIds: ids, clubId: ids[0] || 0, committee: '' } : item)
          : [...staffRoleAssignments(account), { role: 'supervisor', assignedClubIds: ids, clubId: ids[0] || 0, committee: '' }])
        : [{ role: 'supervisor', assignedClubIds: ids, clubId: ids[0] || 0, committee: '' }];
      if (req.body.password) await verifyAccountPasswordSaved(ClubAccount, saved, req.body.password);
      const verified = await verifyAssignments(ClubAccount, email, expectedAssignments);
      if (Number(verified.sessionVersion || 0) !== Number(saved.sessionVersion || 0)) throw new Error('SUPERVISOR_SAVE_UNCONFIRMED');
      refreshAccount(verified);
      res.json({ email: verified.email, assignedClubIds: verified.assignedClubIds,
        savedToDatabase: true, passwordUpdated: Boolean(req.body.password), message: req.body.password ? 'Account saved and verified in the database. Use the new password to sign in.' : account ? 'Assignments saved and verified in the database. The existing password was kept; MIU accounts can also use Google.' : 'Account saved and verified in the database. Use MIU Google sign-in; no portal password was set.' });
    } catch (error) {
      res.status(error.code === 11000 ? 409 : 503).json({ message: writeAcknowledged
        ? 'MongoDB acknowledged the assignment write, but the final saved state could not be verified. Reload before retrying.'
        : 'Supervisor assignments were not confirmed as saved. Reload and try again.' });
    }
  });
}

module.exports = { registerSupervisorAdmin };
