const test = require('node:test');
const assert = require('node:assert/strict');
const { createClubOpeningNotifier } = require('../services/club-opening-notifications');
const club = { id: 5, name: 'MUN', status: 'open', applicationCycleStartedAt: new Date('2026-10-13T08:00:00Z') };
function fixture({ count = 2, fail = false } = {}) {
  const dispatches = new Map(); const sends = [];
  const notify = createClubOpeningNotifier({
    StudentAccount: { find: () => ({ select: () => ({ lean: async () => Array.from({ length: count }, (_, index) => ({ _id: `student-${index}` })) }) }) },
    ClubAccount: { find: () => ({ select: () => ({ lean: async () => [{ _id: 'staff' }] }) }) },
    NotificationDispatch: {
      async create(record) { if (dispatches.has(record.eventKey)) throw Object.assign(new Error('Duplicate'), { code: 11000 }); dispatches.set(record.eventKey, record); },
      async updateOne({ eventKey }, { $set }) { Object.assign(dispatches.get(eventKey), $set); }
    },
    env: { ONESIGNAL_APP_ID: 'configured', ONESIGNAL_REST_API_KEY: 'server-only', ONESIGNAL_SITE_URL: 'https://example.test' },
    send: async payload => { sends.push(payload); if (fail) throw new Error('PROVIDER_DOWN'); return { messageId: 'sent' }; },
    logger: { error() {} }
  });
  return { notify, dispatches, sends };
}
test('opening notifies student and staff aliases with the club name and direct application URL', async () => {
  const state = fixture(); await state.notify('closed', club);
  assert.equal(state.sends.length, 1);
  assert.equal(state.sends[0].message, 'MUN is now open for applications. Check it now!');
  assert.equal(state.sends[0].url, 'https://example.test/?apply=5');
  assert.deepEqual(state.sends[0].externalIds, ['club-account:staff', 'student-0', 'student-1']);
});
test('saving open again, editing a closed club or opening an archived club does not notify', async () => {
  const state = fixture();
  await state.notify('open', club); await state.notify('closed', { ...club, status: 'closed' });
  await state.notify('closed', { ...club, archivedAt: new Date() });
  assert.equal(state.sends.length, 0);
});
test('duplicate/concurrent dispatches send once; a later reopening sends a new notification', async () => {
  const state = fixture(); await Promise.all([state.notify('closed', club), state.notify('closed', club)]);
  assert.equal(state.sends.length, 1);
  await state.notify('full', { ...club, applicationCycleStartedAt: new Date('2026-10-14T08:00:00Z') });
  assert.equal(state.sends.length, 2);
});
test('large audiences are batched and provider failures are recorded without undoing the saved status', async () => {
  const state = fixture({ count: 2001 }); await state.notify('closed', club);
  assert.deepEqual(state.sends.map(send => send.externalIds.length), [1000, 1000, 2]);
  const failed = fixture({ fail: true }); await assert.doesNotReject(failed.notify('closed', club));
  assert.ok([...failed.dispatches.values()].every(record => record.status === 'failed'));
});
