const crypto = require('node:crypto');
const { staffRoleAssignments } = require('./staff-google-auth');

function validateNewClubEmails(body, isAdminEmail) {
  const presidentEmail = typeof body.clubLoginEmail === 'string' ? body.clubLoginEmail.trim().toLowerCase() : '';
  const supervisorEmail = typeof body.supervisorEmail === 'string' ? body.supervisorEmail.trim().toLowerCase() : '';
  const valid = email => email.length <= 254 && /^[a-z0-9._%+-]+@miuegypt\.edu\.eg$/i.test(email);
  if (!valid(presidentEmail)) return { error: 'Enter the president\'s MIU Google email.' };
  if (supervisorEmail && !valid(supervisorEmail)) return { error: 'Enter the supervisor\'s MIU Google email, or leave it empty.' };
  if (supervisorEmail === presidentEmail) return { error: 'Choose a different supervisor email so the president cannot review their own requests.' };
  if ([presidentEmail, supervisorEmail].filter(Boolean).some(isAdminEmail)) return { error: 'Use a staff MIU Google account rather than the configured administrator account.' };
  return { presidentEmail, supervisorEmail };
}

async function assignNewClubRole({ ClubAccount, session, email, clubId, role }) {
  const existing = await ClubAccount.findOne({ email }).session(session).lean();
  const assignments = staffRoleAssignments(existing);
  if (['president', 'vice_president'].includes(role)
    && assignments.some(item => item.role === role && item.clubId !== clubId)) {
    const title = role === 'president' ? 'president' : 'vice president';
    const error = new Error(`This ${title} already manages another club. Choose another MIU email.`);
    error.status = 409; throw error;
  }
  const previous = assignments.find(item => item.role === role);
  const assignment = { role, clubId: role === 'supervisor' ? previous?.clubId || clubId : clubId,
    assignedClubIds: role === 'supervisor' ? [...new Set([...(previous?.assignedClubIds || []), clubId])] : [], committee: '' };
  const roleAssignments = previous ? assignments.map(item => item.role === role ? assignment : item) : [...assignments, assignment];
  const primary = roleAssignments[0];
  if (existing) {
    const saved = await ClubAccount.findOneAndUpdate({ _id: existing._id, sessionVersion: existing.sessionVersion || 0 },
      { $set: { ...primary, roleAssignments }, $inc: { sessionVersion: 1 } }, { session, new: true, runValidators: true }).lean();
    if (!saved) { const error = new Error('The staff account changed. Refresh and try again.'); error.status = 409; throw error; }
    return saved;
  }
  // Match existing Google staff provisioning: generate an undisclosed random secret
  // for the required legacy credential columns; the user signs in through Google.
  const salt = crypto.randomBytes(16).toString('hex');
  const passwordHash = crypto.scryptSync(crypto.randomBytes(48).toString('base64url'), salt, 64).toString('hex');
  const [created] = await ClubAccount.create([{ email, ...primary, roleAssignments, salt, passwordHash, sessionVersion: 0 }], { session });
  return created.toObject();
}

async function removeClubRoleAssignment({ ClubAccount, session, email, clubId, role }) {
  const existing = await ClubAccount.findOne({ email }).session(session).lean();
  if (!existing) return { account: null, removed: false };
  const assignments = staffRoleAssignments(existing);
  const remaining = assignments.filter(item => !(item.role === role && item.clubId === clubId));
  if (remaining.length === assignments.length) return { account: existing, removed: false };

  const version = Number.isSafeInteger(Number(existing.sessionVersion)) ? Number(existing.sessionVersion) : 0;
  const versionFilter = existing.sessionVersion == null
    ? { $or: [{ sessionVersion: { $exists: false } }, { sessionVersion: null }, { sessionVersion: 0 }] }
    : { sessionVersion: version };
  const filter = { _id: existing._id, email, ...versionFilter };

  if (!remaining.length) {
    const result = await ClubAccount.deleteOne(filter, { session });
    if (result.deletedCount !== 1) {
      const error = new Error('The staff account changed. Refresh and try again.');
      error.status = 409;
      throw error;
    }
    return { account: null, removed: true };
  }

  const primary = remaining[0];
  const saved = await ClubAccount.findOneAndUpdate(filter,
    { $set: { ...primary, roleAssignments: remaining }, $inc: { sessionVersion: 1 } },
    { session, new: true, runValidators: true }).lean();
  if (!saved) {
    const error = new Error('The staff account changed. Refresh and try again.');
    error.status = 409;
    throw error;
  }
  return { account: saved, removed: true };
}

module.exports = { validateNewClubEmails, assignNewClubRole, removeClubRoleAssignment };
