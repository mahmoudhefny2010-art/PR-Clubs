'use strict';

const POSITIONAL_REGISTRATION_INDEX = { clubId: 1, eventIndex: 1, email: 1 };

function matchesIndex(index, expectedKey) {
  const entries = Object.entries(index?.key || {});
  const expected = Object.entries(expectedKey);
  return index.unique === true
    && entries.length === expected.length
    && expected.every(([field, direction], position) => entries[position]?.[0] === field && entries[position]?.[1] === direction);
}

async function removeLegacyPositionalUniqueIndex({ EventRegistration, db }) {
  const collectionName = EventRegistration.collection.collectionName;
  const exists = await db.listCollections({ name: collectionName }, { nameOnly: true }).hasNext();
  if (!exists) return false;

  const indexes = await EventRegistration.collection.indexes();
  const legacyIndex = indexes.find((index) => matchesIndex(index, POSITIONAL_REGISTRATION_INDEX));
  if (!legacyIndex) return false;

  // Event positions can change when events are reordered. The current schema
  // intentionally allows multiple registrations per club/event position/email.
  await EventRegistration.collection.dropIndex(legacyIndex.name);
  console.log('Removed obsolete unique club event-position registration index.');
  return true;
}

module.exports = { removeLegacyPositionalUniqueIndex };
