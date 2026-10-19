const crypto = require('node:crypto');
const { createEventContext, fail } = require('./event-attendance-context');
const { eventRules } = require('./student-event-registration');
async function handleUniversityRegistration(req, res, deps) {
  res.setHeader('Cache-Control', 'no-store');
  if (!deps.sameOrigin(req) && req.method !== 'GET') return res.status(403).json({ message: 'Reload the event page before registering.' });
  const context = createEventContext(deps), ref = { source: 'miu', clubId: 0, eventIndex: req.params.id };
  let session;
  try {
    const run = async () => {
      const ctx = await context.resolve(ref, session, req.method !== 'GET'), event = ctx.event;
      if (event.registrationEnabled !== true) fail(409, 'REGISTRATION_CLOSED', 'Registration is closed for this event.');
      const student = req.studentAccount;
      const identity = student || { email: String(req.body?.email || '').trim().toLowerCase(), name: String(req.body?.name || '').trim() };
      if (event.attendanceAudience === 'members' && !student) fail(401, 'SIGN_IN_REQUIRED', 'Sign in with your MIU student account.');
      if (req.method !== 'GET' && (!identity.name || identity.name.length > 160 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identity.email))) fail(400, 'INVALID_PROFILE', 'Enter your name and a valid university email.');
      const existing = identity.email ? await context.registration(ctx, identity, session) : null;
      const countQuery = deps.EventRegistration.countDocuments(ctx.filter); if (session) countQuery.session(session);
      const count = await countQuery, allowed = await context.eligible(ctx, identity, session), reason = eventRules(event), full = event.capacity !== null && count >= event.capacity;
      const cancellationAllowed = Boolean(student && existing && !reason && (event.attendanceSettings?.cancellationEnabled ?? event.cancellationEnabled) === true && (!event.cancellationDeadline || Date.now() < Date.parse(event.cancellationDeadline)));
      if (req.method === 'GET') return { registered: !!existing, eligible: !reason && allowed && !full, audience: event.attendanceAudience === 'members' ? 'members' : 'all_students', capacity: event.capacity, full, registeredCount: count, cancellationAllowed, message: existing ? 'You are registered for this event.' : reason || (!allowed ? 'Registration is limited to current MIU club members.' : full ? 'Full Capacity' : 'Registration is open.') };
      if (req.method === 'DELETE') {
        if (!student || !cancellationAllowed) fail(409, 'CANCELLATION_CLOSED', 'Cancellation is not permitted by this event’s rules.');
        await deps.EventRegistration.deleteOne({ _id: existing._id, email: student.email }, { session });
        return { registered: false, message: 'Your registration was cancelled. Attendance history is unchanged.' };
      }
      if (existing) return { registered: true, alreadyRegistered: true, message: 'You are already registered for this event.' };
      if (reason) fail(409, 'REGISTRATION_CLOSED', reason);
      if (!allowed) fail(403, 'NOT_ELIGIBLE', 'Registration is limited to current MIU club members.');
      if (full) fail(409, 'FULL_CAPACITY', 'Full Capacity');
      await deps.EventRegistration.create([{ id: Date.now() * 1000 + crypto.randomInt(1000), clubId: 0, eventIndex: event.id, eventRequestId: event.id, registrationKey: `miu:${event.id}:${identity.email}`, ...(student?._id ? { studentAccountId: student._id } : {}), name: identity.name, email: identity.email, eventTitle: event.title }], { session });
      return { registered: true, message: 'You are registered for this event.' };
    };
    let result;
    if (req.method === 'GET') result = await run();
    else { session = await deps.database.startSession(); await session.withTransaction(async () => { result = await run(); }, { writeConcern: { w: 'majority' } }); }
    return res.status(req.method === 'POST' && !result.alreadyRegistered ? 201 : 200).json(result);
  } catch (error) { return res.status(error.status || (error.code === 11000 ? 409 : 503)).json({ code: error.status ? error.code : 'REGISTRATION_UNAVAILABLE', message: error.status ? error.message : 'Registration could not be confirmed. Refresh your status before retrying.' }); }
  finally { if (session) await session.endSession(); }
}
module.exports = { handleUniversityRegistration };
