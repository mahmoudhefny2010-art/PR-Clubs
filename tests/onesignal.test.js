const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { ONESIGNAL_API_URL, OneSignalApiError, claimOneSignalDispatch, sendOneSignalPush, sendOneSignalEmail } = require('../services/onesignal');

const baseMessage = {
  appId: '123e4567-e89b-42d3-a456-426614174000',
  apiKey: 'server-only-secret',
  externalId: 'student-object-id',
  title: 'MIU Clubs',
  message: 'Your club application status has been updated.',
  url: 'https://clubs.example/?myForms=1'
};

test('sends only to the authenticated external ID and keeps the REST key out of the body', async () => {
  let request;
  const result = await sendOneSignalPush({
    ...baseMessage,
    fetchImpl: async (url, options) => {
      request = { url, options };
      return { ok: true, status: 200, json: async () => ({ id: 'message-id' }) };
    }
  });

  assert.equal(request.url, ONESIGNAL_API_URL);
  assert.equal(request.options.headers.Authorization, 'Key server-only-secret');
  const body = JSON.parse(request.options.body);
  assert.deepEqual(body.include_aliases, { external_id: ['student-object-id'] });
  assert.equal(body.target_channel, 'push');
  assert.equal(body.url, baseMessage.url);
  assert.equal(JSON.stringify(body).includes(baseMessage.apiKey), false);
  assert.deepEqual(result, { messageId: 'message-id' });
});

test('supports a bounded broadcast to an explicit external-ID audience', async () => {
  let requestBody;
  await sendOneSignalPush({
    ...baseMessage,
    externalIds: ['student-1', 'student-2'],
    fetchImpl: async (_url, options) => {
      requestBody = JSON.parse(options.body);
      return { ok: true, status: 200, json: async () => ({ id: 'broadcast-id' }) };
    }
  });
  assert.deepEqual(requestBody.include_aliases, { external_id: ['student-1', 'student-2'] });
  await assert.rejects(
    sendOneSignalPush({ ...baseMessage, externalIds: Array.from({ length: 20001 }, (_, index) => `student-${index}`), fetchImpl: async () => { throw new Error('should not send'); } }),
    /ONESIGNAL_INVALID_RECIPIENTS/
  );
});

test('records that a dispatch event can be claimed only once', async () => {
  const claimedKeys = new Set();
  const insert = async (key) => {
    if (claimedKeys.has(key)) throw Object.assign(new Error('duplicate'), { code: 11000 });
    claimedKeys.add(key);
  };
  assert.equal(await claimOneSignalDispatch('application-accepted:45', insert), true);
  assert.equal(await claimOneSignalDispatch('application-accepted:45', insert), false);
  assert.equal(claimedKeys.size, 1);
});

test('sends email through OneSignal to the authenticated external ID without exposing the API key', async () => {
  let request;
  const result = await sendOneSignalEmail({
    appId: baseMessage.appId,
    apiKey: baseMessage.apiKey,
    externalId: baseMessage.externalId,
    subject: 'Application update',
    message: 'Your club application status has been updated.',
    url: baseMessage.url,
    fetchImpl: async (url, options) => {
      request = { url, options };
      return { ok: true, status: 200, json: async () => ({ id: 'email-message-id' }) };
    }
  });
  assert.equal(request.url, ONESIGNAL_API_URL);
  assert.deepEqual(JSON.parse(request.options.body).include_aliases, { external_id: ['student-object-id'] });
  assert.equal(JSON.parse(request.options.body).target_channel, 'email');
  assert.equal(JSON.stringify(JSON.parse(request.options.body)).includes(baseMessage.apiKey), false);
  assert.deepEqual(result, { messageId: 'email-message-id' });
});

test('surfaces provider rate limits without leaking response details', async () => {
  await assert.rejects(
    sendOneSignalPush({
      ...baseMessage,
      fetchImpl: async () => ({ ok: false, status: 429, json: async () => ({ errors: ['Too many requests'] }) })
    }),
    (error) => error instanceof OneSignalApiError && error.status === 429 && !error.message.includes('Too many requests')
  );
});

test('does not make a provider request when configuration is missing', async () => {
  let called = false;
  await assert.rejects(sendOneSignalPush({ ...baseMessage, apiKey: '', fetchImpl: async () => { called = true; } }), /ONESIGNAL_NOT_CONFIGURED/);
  assert.equal(called, false);
});

test('keeps identity lookup behind account authentication and exposes no client-callable push dispatch route', () => {
  const serverSource = fs.readFileSync(require.resolve('../server'), 'utf8');
  assert.match(serverSource, /const club = await getClubAccountFromRequest\(req\)/);
  assert.match(serverSource, /if \(!student\) return res.status\(401\)/);
  assert.match(serverSource, /app\.put\('\/api\/notifications\/email-preference',\s*requireStudentAuth/);
  assert.match(serverSource, /dispatchPublishedContentNotifications\(\{/);
  assert.match(serverSource, /emailNotificationsEnabled === true/);
  assert.match(serverSource, /source: 'university'/);
  assert.match(serverSource, /app\.patch\('\/api\/applications\/:id\/status',\s*requireClubAuth/);
  assert.match(serverSource, /async function dispatchSpeakerRequestStatusPush\(request\)/);
  assert.match(serverSource, /request\?\.requesterType !== 'student'/);
  assert.match(serverSource, /Changes were requested to your speaker request/);
  assert.equal([...serverSource.matchAll(/await dispatchSpeakerRequestStatusPush\(record\)/g)].length, 1);
  assert.match(serverSource, /app\.use\('\/api\/admin',\s*requireAdmin\)/);
  assert.doesNotMatch(serverSource, /app\.(?:post|put|patch|delete)\('\/api\/notifications\/(?:dispatch|send)/);
});
