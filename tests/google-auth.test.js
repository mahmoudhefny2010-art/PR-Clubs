const test = require('node:test');
const assert = require('node:assert/strict');
const { verifyGoogleStudentCredential, decideGoogleAccount, decideGoogleLink } = require('../services/google-auth');

const baseClaims = {
  sub: 'google-subject-123',
  email: 'student@miuegypt.edu.eg',
  email_verified: true,
  hd: 'miuegypt.edu.eg',
  name: 'MIU Student',
  nonce: 'nonce-value',
  iat: Math.floor(Date.now() / 1000)
};

function verifierFor(claims) {
  return { verifyIdToken: async ({ idToken, audience }) => {
    assert.equal(idToken, 'signed-google-token');
    assert.equal(audience, 'web-client-id');
    return { getPayload: () => claims };
  } };
}

test('verified MIU identity is returned using the stable Google subject', async () => {
  const identity = await verifyGoogleStudentCredential({
    credential: 'signed-google-token', expectedNonce: 'nonce-value', clientId: 'web-client-id', client: verifierFor(baseClaims)
  });
  assert.deepEqual(identity, { googleSub: 'google-subject-123', email: 'student@miuegypt.edu.eg', name: 'MIU Student' });
});

test('invalid Google credentials, wrong nonce, unverified email and non-MIU identities are rejected', async () => {
  const rejects = async (claims, expectedNonce = 'nonce-value') => assert.rejects(
    verifyGoogleStudentCredential({ credential: 'signed-google-token', expectedNonce, clientId: 'web-client-id', client: verifierFor(claims) })
  );
  await assert.rejects(verifyGoogleStudentCredential({ credential: 'bad', expectedNonce: 'nonce-value', clientId: 'web-client-id', client: { verifyIdToken: async () => { throw new Error('bad token'); } } }), /GOOGLE_CREDENTIAL_INVALID/);
  await rejects({ ...baseClaims, nonce: 'attacker-nonce' });
  await rejects({ ...baseClaims, email_verified: false });
  await rejects({ ...baseClaims, hd: 'gmail.com', email: 'student@gmail.com' });
  await rejects({ ...baseClaims, email: 'student@miuegypt.edu.eg', hd: undefined });
  await rejects({ ...baseClaims, sub: '' });
});

test('existing Google subjects sign in while matching existing emails require an explicit link', () => {
  const linked = { email: 'student@miuegypt.edu.eg', googleSub: 'google-subject-123' };
  assert.deepEqual(decideGoogleAccount({ accountBySubject: linked, accountByEmail: null }), { action: 'sign_in', account: linked });
  assert.deepEqual(decideGoogleAccount({ accountBySubject: null, accountByEmail: { email: linked.email } }), { action: 'explicit_link_required', account: { email: linked.email } });
  assert.deepEqual(decideGoogleAccount({ accountBySubject: null, accountByEmail: null }), { action: 'create' });
});

test('linking requires a signed-in matching email and rejects subject collisions or replacing a link', () => {
  const base = { accountEmail: 'student@miuegypt.edu.eg', googleEmail: 'student@miuegypt.edu.eg', requestedGoogleSub: 'subject-a' };
  assert.equal(decideGoogleLink(base), 'link');
  assert.equal(decideGoogleLink({ ...base, googleEmail: 'someone@miuegypt.edu.eg' }), 'email_mismatch');
  assert.equal(decideGoogleLink({ ...base, subjectOwnerEmail: 'other@miuegypt.edu.eg' }), 'subject_in_use');
  assert.equal(decideGoogleLink({ ...base, currentGoogleSub: 'subject-b' }), 'different_google_account_linked');
  assert.equal(decideGoogleLink({ ...base, currentGoogleSub: 'subject-a', subjectOwnerEmail: base.accountEmail }), 'link');
});
