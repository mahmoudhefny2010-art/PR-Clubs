const crypto = require('crypto');

function passwordInputError(body) {
  if (body.password === undefined || body.password === '') return '';
  if (typeof body.password !== 'string' || body.password.length < 12 || body.password.length > 200) return 'Use a password between 12 and 200 characters.';
  if (body.confirmPassword !== body.password) return 'The passwords do not match.';
  return '';
}
async function hashAccountPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const passwordHash = await new Promise((resolve, reject) => crypto.scrypt(password, salt, 64,
    (error, hash) => error ? reject(error) : resolve(hash.toString('hex'))));
  return { salt, passwordHash, passwordChangedAt: new Date() };
}
function matchesAccountPassword(password, account) {
  if (typeof password !== 'string' || !account?.salt || !/^[a-f\d]{128}$/i.test(account.passwordHash || '')) return false;
  return crypto.timingSafeEqual(Buffer.from(account.passwordHash, 'hex'), crypto.scryptSync(password, account.salt, 64));
}
async function verifyAccountPasswordSaved(ClubAccount, saved, password) {
  const account = await ClubAccount.findOne({ email: saved.email }).read('primary').readConcern('majority').lean();
  if (!account || account.salt !== saved.salt || account.passwordHash !== saved.passwordHash
    || !matchesAccountPassword(password, account)) throw new Error('PASSWORD_SAVE_UNCONFIRMED');
  return account;
}
module.exports = { passwordInputError, hashAccountPassword, matchesAccountPassword, verifyAccountPasswordSaved };
