// Called only with an identity obtained from a validated staff/admin session.
// Reuse a student's profile without changing passwords, Google links or staff roles.
async function resolveUniversityStudentProfile(StudentAccount, identity) {
  const email = String(identity?.email || '').trim().toLowerCase();
  if (!/^[a-z0-9._%+-]+@miuegypt\.edu\.eg$/.test(email) || !identity?.googleSub) return null;
  const subjectOwner = await StudentAccount.findOne({ googleSub: identity.googleSub }).read('primary').lean();
  if (subjectOwner && subjectOwner.email !== email) return null;
  const existing = subjectOwner || await StudentAccount.findOne({ email }).read('primary').lean();
  if (existing) return existing.googleSub && existing.googleSub !== identity.googleSub ? null : existing;
  // Email uniqueness makes provisioning safe when several page checks run together.
  let account;
  try {
    account = await StudentAccount.findOneAndUpdate({ email }, { $setOnInsert: {
      email, name: String(identity.name || email.split('@')[0]).trim().slice(0, 160) || email.split('@')[0]
    } }, { upsert: true, new: true, runValidators: true, writeConcern: { w: 'majority' } }).lean();
  } catch (error) {
    if (error.code !== 11000) throw error;
    account = await StudentAccount.findOne({ email }).read('primary').lean();
  }
  return account && (!account.googleSub || account.googleSub === identity.googleSub) ? account : null;
}

module.exports = { resolveUniversityStudentProfile };
