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
  if (role === 'president' && assignments.some(item => item.role === 'president' && item.clubId !== clubId)) {
    const error = new Error('This president already manages another club. Choose another MIU email.');
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
module.exports = { validateNewClubEmails, assignNewClubRole };
