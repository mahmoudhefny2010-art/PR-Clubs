const { OAuth2Client } = require('google-auth-library');

const googleClient = new OAuth2Client();
const MIU_EMAIL = /^[a-z0-9._%+-]+@miuegypt\.edu\.eg$/i;

async function verifyGoogleStudentCredential({ credential, expectedNonce, clientId, client = googleClient, now = Date.now() }) {
  if (typeof credential !== 'string' || credential.length > 12_000 || !expectedNonce || !clientId) {
    throw new Error('GOOGLE_CREDENTIAL_INVALID');
  }

  let ticket;
  try {
    ticket = await client.verifyIdToken({ idToken: credential, audience: clientId });
  } catch {
    throw new Error('GOOGLE_CREDENTIAL_INVALID');
  }

  const claims = ticket?.getPayload?.();
  const email = typeof claims?.email === 'string' ? claims.email.trim().toLowerCase() : '';
  const hostedDomain = typeof claims?.hd === 'string' ? claims.hd.trim().toLowerCase() : '';
  const issuedAt = Number(claims?.iat) * 1000;
  if (!claims || typeof claims.sub !== 'string' || !claims.sub
    || claims.nonce !== expectedNonce
    || claims.email_verified !== true
    || hostedDomain !== 'miuegypt.edu.eg'
    || !MIU_EMAIL.test(email)
    || (claims.azp && claims.azp !== clientId)
    || !Number.isFinite(issuedAt) || issuedAt > now + 60_000) {
    throw new Error('GOOGLE_ACCOUNT_NOT_ALLOWED');
  }

  return { googleSub: claims.sub, email, name: typeof claims.name === 'string' ? claims.name : '' };
}

function decideGoogleAccount({ accountBySubject, accountByEmail }) {
  if (accountBySubject) return { action: 'sign_in', account: accountBySubject };
  if (accountByEmail) return { action: 'explicit_link_required', account: accountByEmail };
  return { action: 'create' };
}

function decideGoogleLink({ accountEmail, googleEmail, currentGoogleSub, requestedGoogleSub, subjectOwnerEmail }) {
  if (String(accountEmail || '').toLowerCase() !== String(googleEmail || '').toLowerCase()) return 'email_mismatch';
  if (subjectOwnerEmail && String(subjectOwnerEmail).toLowerCase() !== String(accountEmail || '').toLowerCase()) return 'subject_in_use';
  if (currentGoogleSub && currentGoogleSub !== requestedGoogleSub) return 'different_google_account_linked';
  return 'link';
}

module.exports = { verifyGoogleStudentCredential, decideGoogleAccount, decideGoogleLink };
