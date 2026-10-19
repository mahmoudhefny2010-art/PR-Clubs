const fail = (status, code, message) => { throw Object.assign(new Error(message), { status, code }); };
function localInstant(date, time, zone = 'Africa/Cairo') {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '') || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time || '')) fail(409, 'SCHEDULE_REQUIRED', 'A valid event date and start time must be configured.');
  const nominal = Date.parse(`${date}T${time}:00Z`);
  if (!Number.isFinite(nominal) || new Date(nominal).toISOString().slice(0, 10) !== date) fail(409, 'SCHEDULE_REQUIRED', 'The event date is invalid.');
  let formatter;
  try { formatter = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }); } catch { fail(422, 'TIMEZONE_INVALID', 'Choose a valid event timezone.'); }
  const parts = value => Object.fromEntries(formatter.formatToParts(value).map(part => [part.type, part.value]));
  let guess = nominal;
  for (let i = 0; i < 4; i++) { const p = parts(guess); const wall = Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}Z`); const next = nominal - (wall - guess); if (next === guess) break; guess = next; }
  const p = parts(guess);
  if (`${p.year}-${p.month}-${p.day}` !== date || `${p.hour}:${p.minute}` !== time) fail(409, 'SCHEDULE_REQUIRED', 'This local time does not exist in the event timezone. Choose another time.');
  return guess;
}
function attendanceWindow(event, now = Date.now()) {
  const zone = event.attendanceSettings?.timeZone || 'Africa/Cairo';
  const start = localInstant(event.date, event.time, zone), opens = start - 600000;
  const nextDate = new Date(Date.parse(event.date + 'T12:00:00Z') + 86400000).toISOString().slice(0, 10);
  const ends = event.attendanceSettings?.endTime ? localInstant(event.date, event.attendanceSettings.endTime, zone) : localInstant(nextDate, '00:00', zone);
  if (ends <= start) fail(409, 'SCHEDULE_REQUIRED', 'Attendance end must be after the event start.');
  return { serverNow: now, startsAt: start, opensAt: opens, endsAt: ends, timeZone: zone, state: now < opens ? 'waiting' : now >= ends ? 'closed' : 'open' };
}
function createEventContext({ Club, UniversityContent, Application, EventRegistration, database }) {
  async function resolve(ref, session, lock = false) {
    const source = ref.source, clubId = Number(ref.clubId);
    let eventIndex = Number(ref.eventIndex);
    if (!['club', 'miu'].includes(source) || !Number.isSafeInteger(clubId) || !Number.isSafeInteger(eventIndex) || eventIndex < 0 || (source === 'club' ? clubId < 1 : clubId !== 0 || eventIndex < 1)) fail(400, 'INVALID_EVENT', 'Choose a valid event.');
    if (ref.eventRequestId !== undefined && (!Number.isSafeInteger(Number(ref.eventRequestId)) || Number(ref.eventRequestId) < 1)) fail(400, 'INVALID_EVENT', 'Choose a valid event identity.');
    let club, event;
    if (source === 'club') {
      // SQL Session already holds the platform transaction write lock. MongoDB
      // needs the parent write to serialize capacity and attendance decisions.
      if (lock && !database?.isSqlProvider) await Club.updateOne({ id: clubId, archivedAt: null }, { $inc: { registrationRevision: 1 } }, { session });
      club = await Club.findOne({ id: clubId, archivedAt: null }).session(session).lean();
      if (ref.eventRequestId !== undefined) eventIndex = club?.events?.findIndex(item => Number(item.requestId) === Number(ref.eventRequestId)) ?? -1;
      event = club?.events?.[eventIndex];
    } else {
      if (lock && !database?.isSqlProvider) await UniversityContent.updateOne({ id: eventIndex, type: 'event' }, { $inc: { __v: 1 } }, { session });
      event = await UniversityContent.findOne({ id: eventIndex, type: 'event' }).session(session).lean();
      if (ref.eventRequestId !== undefined && Number(ref.eventRequestId) !== eventIndex) fail(409, 'WRONG_EVENT', 'This reference belongs to a different university event.');
    }
    if (!event?.title) fail(404, 'EVENT_NOT_FOUND', 'This event is no longer available.');
    if (source === 'club' && (!Number.isSafeInteger(Number(event.requestId)) || Number(event.requestId) < 1)) fail(409, 'EVENT_ID_MIGRATION_REQUIRED', 'This legacy event needs the attendance identity migration before QR attendance can open.');
    const eventRequestId = source === 'miu' ? event.id : Number(event.requestId);
    const capacity = event.capacity ?? event.attendanceSettings?.registrationCapacity ?? null;
    const filter = source === 'miu' ? { clubId: 0, eventIndex: event.id } : eventRequestId > 0 ? { clubId, $or: [{ eventRequestId }, { eventIndex, eventTitle: event.title, eventRequestId: { $exists: false } }] } : { clubId, eventIndex, eventTitle: event.title, eventRequestId: { $exists: false } };
    return { source, clubId, eventIndex, eventRequestId, key: `${source}:${clubId}:${eventRequestId}`, club, event: { ...event, capacity }, filter };
  }
  async function eligible(context, student, session) {
    if (context.event.attendanceAudience !== 'members') return true;
    const email = student.email.toLowerCase();
    if (context.source === 'club') return (context.club.memberRoster || []).some(item => String(item.email).toLowerCase() === email) || !!await Application.findOne({ clubId: context.clubId, email, status: 'accepted' }).session(session).lean();
    return !!await Club.findOne({ archivedAt: null, 'memberRoster.email': email }).session(session).lean() || !!await Application.findOne({ email, status: 'accepted' }).session(session).lean();
  }
  async function registration(context, student, session) { return EventRegistration.findOne({ ...context.filter, email: student.email.toLowerCase() }).session(session).lean(); }
  return { resolve, eligible, registration };
}
module.exports = { createEventContext, attendanceWindow, localInstant, fail };
