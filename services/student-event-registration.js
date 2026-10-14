const crypto = require('crypto');
function eventRules(event, now = new Date()) {
  if (event.registrationEnabled === false || event.cancelled === true || (event.status && !['published', 'approved'].includes(event.status))) return 'Registration is closed for this event.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(event.date || '') || !Number.isFinite(Date.parse(event.date)) || new Date(event.date).toISOString().slice(0, 10) !== event.date) return 'Registration is unavailable until a valid event date is configured.';
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now).map(p => [p.type, p.value]));
  const today = `${parts.year}-${parts.month}-${parts.day}`;
  if (event.date < today) return 'This event has expired.';
  if (event.date === today && /^([01]\d|2[0-3]):[0-5]\d$/.test(event.time || '') && event.time <= `${parts.hour}:${parts.minute}`) return 'Registration has ended because this event has started.';
  if (event.registrationDeadline != null && (!Number.isFinite(Date.parse(event.registrationDeadline)) || now >= new Date(event.registrationDeadline))) return 'The registration deadline has passed or is invalid.';
  if (event.capacity != null && (!Number.isSafeInteger(event.capacity) || event.capacity < 0)) return 'The event capacity configuration is invalid.';
  return '';
}
function registerStudentEvents(app, deps) {
  const { Club, Application, EventRegistration, StudentInterest, mongoose, requireStudentAuth, sameOrigin, databaseReady } = deps;
  const route = '/api/events/:clubId/:eventIndex/registrations';
  const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
  async function handle(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    if (!/^\d+$/.test(req.params.clubId) || !/^\d+$/.test(req.params.eventIndex) || !Number.isSafeInteger(Number(req.params.clubId)) || !Number.isSafeInteger(Number(req.params.eventIndex)) || Number(req.params.clubId) < 1) return res.status(400).json({ message: 'Invalid club or event ID.' });
    if (req.method !== 'GET' && !sameOrigin(req)) return res.status(403).json({ message: 'Reload the event page before registering.' });
    if (!databaseReady()) return res.status(503).json({ message: 'Registration database is unavailable.' });
    const clubId = Number(req.params.clubId), eventIndex = Number(req.params.eventIndex), student = req.studentAccount;
    const email = String(student.email || '').trim().toLowerCase();
    if (!student._id || !email || !student.name) return res.status(400).json({ message: 'Complete your student account name and email first.' });
    let session, eventTitle;
    try {
      const perform = async () => {
        // Serialize registration/cancellation per club in MongoDB. The lock and
        // registration write commit together, including capacity checks.
        if (session) await Club.updateOne({ id: clubId, archivedAt: null }, { $inc: { registrationRevision: 1 } }, { session });
        const query = Club.findOne({ id: clubId, archivedAt: null }).select('id events memberRoster');
        if (session) query.session(session);
        const club = await query.lean(), event = club?.events?.[eventIndex];
        if (!event || !event.title) fail(404, 'This event is no longer available.');
        eventTitle = event.title;
        const audience = event.attendanceAudience === 'members' ? 'members' : 'all_students';
        let isMember = audience === 'all_students' || (club?.memberRoster || []).some(member => String(member.email || '').trim().toLowerCase() === email);
        if (!isMember && audience === 'members' && Application) {
          let membershipQuery = Application.exists({ clubId, email, status: 'accepted' });
          if (session && typeof membershipQuery.session === 'function') membershipQuery = membershipQuery.session(session);
          isMember = Boolean(await membershipQuery);
        }
        const audienceMessage = audience === 'members' && !isMember ? 'Registration is limited to current members of this club. Sign in with the MIU email on your accepted membership.' : '';
        const requestId = Number(event.requestId) > 0 ? Number(event.requestId) : null;
        const eventFilter = requestId ? { clubId, $or: [{ eventRequestId: requestId }, { eventIndex, eventTitle: event.title, eventRequestId: { $exists: false } }] }
          : { clubId, eventIndex, eventTitle: event.title, eventRequestId: { $exists: false } };
        const existingQuery = EventRegistration.findOne({ ...eventFilter, email });
        if (session) existingQuery.session(session);
        const existing = await existingQuery.lean();
        const reason = eventRules(event);
        const cancellationAllowed = Boolean(existing && !reason && event.cancellationEnabled === true
          && (!event.cancellationDeadline || Number.isFinite(Date.parse(event.cancellationDeadline)) && new Date() < new Date(event.cancellationDeadline)));
        if (req.method === 'GET') {
          const countQuery = EventRegistration.countDocuments(eventFilter);
          const count = await countQuery;
          return { registered: Boolean(existing), eligible: !reason && isMember && (event.capacity == null || count < event.capacity), audience,
            message: existing ? 'You are registered. Registration is not proof of physical attendance.' : reason || audienceMessage || (event.capacity != null && count >= event.capacity ? 'This event is full.' : audience === 'members' ? 'Registration is open to current members of this club.' : 'Registration is open to all university students, including non-members.'), cancellationAllowed, capacity: event.capacity ?? null, registeredCount: count };
        }
        if (req.method === 'DELETE') {
          if (!existing) return { registered: false, message: 'You are not registered for this event.' };
          if (!cancellationAllowed) fail(409, 'Cancellation is not permitted by this event’s rules.');
          await EventRegistration.deleteOne({ _id: existing._id, email }, { session });
          return { registered: false, message: 'Your registration was cancelled. Verified attendance records are unchanged.' };
        }
        if (existing) return { registered: true, alreadyRegistered: true, message: 'You are already registered for this event.' };
        if (reason) fail(409, reason);
        if (!isMember) fail(403, audienceMessage);
        const count = await EventRegistration.countDocuments(eventFilter).session(session);
        if (event.capacity != null && count >= event.capacity) fail(409, 'This event is full.');
        await EventRegistration.create([{
          id: Date.now() * 1000 + crypto.randomInt(1000), clubId, eventIndex, eventTitle: event.title,
          ...(requestId ? { eventRequestId: requestId } : {}),
          registrationKey: `${clubId}:${requestId ? 'request:' + requestId : 'legacy:' + eventIndex + ':' + event.title}:${student._id}`,
          studentAccountId: student._id, name: student.name, email
        }], { session });
        return { registered: true, message: 'Registration confirmed. This does not mark you physically present.' };
      };
      let result;
      if (req.method === 'GET') result = await perform();
      else { session = await mongoose.startSession(); await session.withTransaction(async () => { result = await perform(); }, { writeConcern: { w: 'majority' } }); }
      if (req.method !== 'GET' && StudentInterest) {
        try { await StudentInterest.updateOne({ studentEmail: email, clubId, eventIndex }, {
          $setOnInsert: { studentEmail: email, clubId, eventIndex, detailViews: 0 },
          $set: { eventTitle, registered: result.registered }
        }, { upsert: true, writeConcern: { w: 'majority' } }); } catch { /* Attendance registration is authoritative; analytics must not undo it. */ }
      }
      res.status(req.method === 'POST' && !result.alreadyRegistered ? 201 : 200).json(result);
    } catch (error) {
      res.status(error.status || (error.code === 11000 ? 409 : 503)).json({ message: error.status ? error.message : error.code === 11000 ? 'A registration already exists. Reload to check your status.' : 'Registration could not be confirmed. Reload your status before retrying.' });
    } finally { if (session) await session.endSession(); }
  }
  app.get(route, requireStudentAuth, handle); app.post(route, requireStudentAuth, handle); app.delete(route, requireStudentAuth, handle);
}
module.exports = { registerStudentEvents, eventRules };
