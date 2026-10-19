const { WorkflowError } = require('./workflow-policy');

async function publishApprovedContent(record, session, { Club, contentClubField, buildPublishedItem }) {
  if (record.type === 'entry_permit') return;

  // Archived clubs stay hidden from public queries, but an in-flight request
  // must still be reviewable and publishable so it is present if the club is restored.
  const club = await Club.findOne({ id: record.clubId }).session(session);
  if (!club) throw new WorkflowError(409, 'The club record was removed. Restore or recreate it before final approval.');

  const field = contentClubField[record.type];
  const previous = (club[field] || []).find(item => Number(item.requestId) === Number(record.id));
  const published = buildPublishedItem({ ...record, publishedAt: new Date() }, club);
  if (record.type === 'event' && previous) {
    published.capacity = previous.capacity;
    published.attendanceSettings = previous.attendanceSettings;
  }
  club[field] = (club[field] || []).filter(item => Number(item.requestId) !== Number(record.id));
  club[field].push(published);
  await club.save({ session });
}

module.exports = { publishApprovedContent };
