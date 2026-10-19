const test = require('node:test');
const assert = require('node:assert/strict');
const { publishApprovedContent } = require('../services/workflow-content-publisher');

test('final approval updates an archived club request without making the club public', async () => {
  const club = {
    id: 8,
    archivedAt: new Date('2026-10-01T00:00:00Z'),
    events: [
      { requestId: 31, title: 'Old version', capacity: 40, attendanceSettings: { enabled: true } },
      { requestId: 99, title: 'Another event' }
    ],
    async save(options) { this.savedWith = options; }
  };
  let query, session;
  const Club = { findOne(filter) { query = filter; return { session(value) { session = value; return Promise.resolve(club); } }; } };
  const record = { id: 31, clubId: 8, type: 'event', title: 'Approved event' };
  const transaction = {};

  await publishApprovedContent(record, transaction, {
    Club,
    contentClubField: { event: 'events' },
    buildPublishedItem: request => ({ requestId: request.id, title: request.title })
  });

  assert.deepEqual(query, { id: 8 }, 'archivedAt is deliberately not part of the lookup');
  assert.equal(session, transaction);
  assert.equal(club.events.length, 2);
  assert.deepEqual(club.events.find(item => item.requestId === 31), {
    requestId: 31,
    title: 'Approved event',
    capacity: 40,
    attendanceSettings: { enabled: true }
  });
  assert.equal(club.events.find(item => item.requestId === 99).title, 'Another event');
  assert.equal(club.archivedAt.toISOString(), '2026-10-01T00:00:00.000Z');
  assert.deepEqual(club.savedWith, { session: transaction });
});

test('final approval gives a clear recovery error if the club record was deleted', async () => {
  const Club = { findOne() { return { session() { return Promise.resolve(null); } }; } };
  await assert.rejects(
    publishApprovedContent({ id: 31, clubId: 8, type: 'event' }, {}, {
      Club,
      contentClubField: { event: 'events' },
      buildPublishedItem: () => ({})
    }),
    error => error.status === 409 && /Restore or recreate it/.test(error.message)
  );
});

test('entry permits do not publish club content', async () => {
  let queried = false;
  const Club = { findOne() { queried = true; throw new Error('should not query'); } };
  await publishApprovedContent({ id: 31, clubId: 8, type: 'entry_permit' }, {}, {
    Club,
    contentClubField: {},
    buildPublishedItem: () => ({})
  });
  assert.equal(queried, false);
});
