'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { removeLegacyPositionalUniqueIndex } = require('../services/event-registration-indexes');

function setup({ exists = true, indexes = [] } = {}) {
  const dropped = [];
  return {
    dropped,
    dependencies: {
      EventRegistration: {
        collection: {
          collectionName: 'eventregistrations',
          indexes: async () => indexes,
          dropIndex: async (name) => dropped.push(name)
        }
      },
      db: {
        listCollections: () => ({ hasNext: async () => exists })
      }
    }
  };
}

test('removes only the obsolete unique positional registration index', async () => {
  const state = setup({ indexes: [
    { name: '_id_', key: { _id: 1 }, unique: true },
    { name: 'clubId_1_eventIndex_1_email_1', key: { clubId: 1, eventIndex: 1, email: 1 }, unique: true },
    { name: 'other_index', key: { clubId: 1, eventIndex: 1, email: 1 } }
  ] });

  assert.equal(await removeLegacyPositionalUniqueIndex(state.dependencies), true);
  assert.deepEqual(state.dropped, ['clubId_1_eventIndex_1_email_1']);
});

test('leaves non-unique and unrelated unique indexes untouched', async () => {
  const state = setup({ indexes: [
    { name: 'clubId_1_eventIndex_1_email_1', key: { clubId: 1, eventIndex: 1, email: 1 } },
    { name: 'other_unique', key: { clubId: 1, eventIndex: 1, email: 1, name: 1 }, unique: true }
  ] });

  assert.equal(await removeLegacyPositionalUniqueIndex(state.dependencies), false);
  assert.deepEqual(state.dropped, []);
});

test('does not inspect indexes for a collection that does not exist yet', async () => {
  const state = setup({ exists: false });

  assert.equal(await removeLegacyPositionalUniqueIndex(state.dependencies), false);
  assert.deepEqual(state.dropped, []);
});
