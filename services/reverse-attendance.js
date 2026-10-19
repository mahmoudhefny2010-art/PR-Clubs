const crypto = require('node:crypto');
let lastAuditId = 0;
const { createEventContext, attendanceWindow, fail } = require('./event-attendance-context');
const { staffRoleAssignments } = require('./staff-google-auth');
const PERIOD = 20000, DEVICE_TTL = 30 * 86400000;
function createAttendanceCipher(secret, clock = Date.now) {
  if (!secret || secret.length < 24) throw new Error('A strong existing session secret is required for attendance tokens.');
  const key = crypto.createHash('sha256').update('reverse-attendance-v1:' + secret).digest();
  const seal = payload => { const iv = crypto.randomBytes(12), cipher = crypto.createCipheriv('aes-256-gcm', key, iv); const text = Buffer.concat([cipher.update(JSON.stringify(payload)), cipher.final()]); return ['ra1', iv.toString('base64url'), text.toString('base64url'), cipher.getAuthTag().toString('base64url')].join('.'); };
  const open = (token, purpose, eventKey) => {
    if (typeof token !== 'string' || token.length > 2500 || !/^ra1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) fail(422, 'INVALID_QR', 'Invalid attendance QR code.');
    let data;
    try { const [, iv, text, tag] = token.split('.'); const cipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url')); cipher.setAuthTag(Buffer.from(tag, 'base64url')); data = JSON.parse(Buffer.concat([cipher.update(Buffer.from(text, 'base64url')), cipher.final()]).toString()); } catch { fail(422, 'INVALID_QR', 'Invalid or altered attendance QR code.'); }
    if (data.purpose !== purpose) fail(422, 'INVALID_QR', 'This code is not an attendance code.');
    if (data.event !== eventKey) fail(409, 'WRONG_EVENT', 'This QR belongs to a different event.');
    if (!Number.isSafeInteger(data.exp) || data.exp <= clock() || !Number.isSafeInteger(data.iat) || data.iat < 0 || data.exp <= data.iat || data.iat > clock() + 1000 || data.exp - data.iat > (purpose === 'verify' ? 60000 : PERIOD)) fail(410, 'EXPIRED_QR', 'This QR code expired. Ask the student to display a refreshed code.');
    if (!/^[a-f0-9]{24}$/i.test(data.account || '')) fail(422, 'INVALID_QR', 'Invalid attendance identity.');
    return data;
  };
  return { seal, open };
}
function createReverseAttendance(deps) {
  const { database, Club, UniversityContent, StudentAccount, EventRegistration, AttendanceRecord, AttendanceSession, AttendanceAssignment, AttendanceActivityClosure, AuditLog, DeviceBinding, secret, deviceHash, isItHead = () => false, bindAssignedDevice = async () => true, clock = Date.now } = deps;
  const context = createEventContext(deps), cipher = createAttendanceCipher(secret, clock);
  async function transaction(fn) { const session = await database.startSession(); try { let value; await session.withTransaction(async () => { value = await fn(session); }); return value; } finally { await session.endSession(); } }
  async function audit(actor, action, ctx, details, session) {
    // IDs are exact IEEE-754 integers within this range and work with both
    // Mongo and SQL's numeric audit key. Random entropy avoids clock and
    // multi-process collisions; the process counter guarantees local ordering.
    const candidate = crypto.randomInt(1, 2 ** 48);
    lastAuditId = Math.max(candidate, lastAuditId + 1);
    await AuditLog.create([{ id: lastAuditId, actorEmail: actor.email, actorRole: actor.role || (actor.admin ? 'admin' : 'student'), action, targetType: 'attendance', targetId: ctx.key, targetName: ctx.event.title, details: JSON.stringify(details) }], { session });
  }
  function manager(ctx, actor) {
    if (actor.admin) return true;
    const assignments = staffRoleAssignments(actor);
    if (assignments.some(item => item.role === 'software_development')) return true;
    if (ctx.source === 'miu') return assignments.some(item => ['pr', 'sso', 'dean', 'miu_events'].includes(item.role));
    return assignments.some(item => item.role === 'president' && Number(item.clubId) === ctx.clubId || item.role === 'head' && Number(item.clubId) === ctx.clubId && isItHead({ ...actor, ...item }));
  }
  async function permission(ctx, actor, req, res, session) {
    if (manager(ctx, actor)) return { canVerify: true, canManageCapacity: true };
    if (staffRoleAssignments(actor).some(item => item.role === 'supervisor' && (item.assignedClubIds || []).map(Number).includes(ctx.clubId)) && ctx.source === 'club') return { canVerify: true, canManageCapacity: false };
    const filter = { clubId: ctx.clubId, itemType: 'event', eventRequestId: ctx.eventRequestId };
    if (ctx.source === 'miu') {
      const supervised = await AttendanceSession.findOne({ ...filter, sourceType: 'miu', active: true, assignedSupervisorEmail: actor.email }).session(session).lean();
      if (supervised) return { canVerify: true, canManageCapacity: false, scanSessionId: String(supervised._id) };
    }
    const assigned = ctx.source === 'club' ? await AttendanceAssignment.findOne({ ...filter, memberEmail: actor.email, status: 'accepted' }).session(session).lean() : await AttendanceSession.findOne({ ...filter, sourceType: 'miu', active: true, assignedMemberEmail: actor.email, assignedMemberAccepted: true }).session(session).lean();
    if (!assigned || !await bindAssignedDevice(assigned, ctx.source, actor.email, req, res)) fail(403, 'UNAUTHORIZED_SUPERVISOR', 'You are not assigned to scan attendance for this event on this device.');
    return { canVerify: false, canManageCapacity: false, ...(ctx.source === 'miu' ? { scanSessionId: String(assigned._id) } : {}) };
  }
  async function openWindow(ctx, session) {
    if (ctx.event.cancelled || ctx.event.status && !['published', 'approved'].includes(ctx.event.status)) fail(409, 'EVENT_CANCELLED', 'This event is cancelled or no longer published.');
    if (ctx.event.attendanceEnabled === false) fail(409, 'ATTENDANCE_DISABLED', 'Attendance is disabled for this event.');
    if (await AttendanceActivityClosure.findOne({ clubId: ctx.clubId, itemType: 'event', eventRequestId: ctx.eventRequestId }).session(session).lean()) fail(410, 'ATTENDANCE_CLOSED', 'Attendance was closed by the event manager.');
    return attendanceWindow(ctx.event, clock());
  }
  async function bindDevice(student, req, res, retry = true) {
    const hash = deviceHash(req, res), id = String(student._id), now = clock();
    const current = await DeviceBinding.findOne({ deviceHash: hash }).lean();
    if (current?.state.current === id && new Date(current.expiresAt).getTime() > now) return current;
    try { return await transaction(async session => {
      let binding = await DeviceBinding.findOne({ deviceHash: hash }).session(session).lean();
      if (!binding) {
        const [created] = await DeviceBinding.create([{ deviceHash: hash, state: { first: id, current: id, generation: 1, switched: false }, expiresAt: new Date(now + DEVICE_TTL) }], { session });
        return created.toObject ? created.toObject() : created;
      }
      if (new Date(binding.expiresAt).getTime() <= now || binding.state.current !== id) {
        const expired = new Date(binding.expiresAt).getTime() <= now;
        const state = { first: expired ? id : binding.state.first, current: id, generation: binding.state.generation + 1, switched: expired ? false : true };
        binding = await DeviceBinding.findOneAndUpdate({ _id: binding._id, 'state.generation': binding.state.generation }, { $set: { state, expiresAt: new Date(now + DEVICE_TTL) } }, { new: true, session }).lean();
        if (!binding) fail(409, 'DEVICE_CHANGED', 'Your account changed on this browser. Reload your attendance QR.');
      }
      return binding;
    }); } catch (error) { if (error.code === 11000 && retry) return bindDevice(student, req, res, false); throw error; }
  }
  async function issue(ref, student, req, res) {
    const ctx = await context.resolve(ref), window = await openWindow(ctx);
    if (!await context.registration(ctx, student)) fail(403, 'NOT_REGISTERED', 'You are not registered for this event, or your registration was cancelled.');
    if (!await context.eligible(ctx, student)) fail(403, 'NOT_ELIGIBLE', 'Your current membership is not eligible for this event.');
    const existing = await AttendanceRecord.findOne({ clubId: ctx.clubId, itemType: 'event', eventRequestId: ctx.eventRequestId, email: student.email }).lean();
    if (existing) return { ...window, attended: true, attendedAt: existing.attendedAt, message: 'Attendance has already been recorded.' };
    if (window.state !== 'open') return { ...window, available: false, message: window.state === 'waiting' ? 'Your attendance QR opens ten minutes before the event.' : 'Attendance is closed for this event.' };
    if (!student.name || !student.universityId) fail(422, 'PROFILE_REQUIRED', 'Complete your name and official university ID in your existing student profile first.');
    let binding;
    try { binding = await bindDevice(student, req, res); } catch (error) { if (error.code !== 11000) throw error; binding = await bindDevice(student, req, res); }
    const now = clock(), exp = Math.min(now + PERIOD, window.endsAt);
    const token = cipher.seal({ purpose: 'attendance', account: String(student._id), version: student.sessionVersion || 0, event: ctx.key, device: binding.deviceHash, generation: binding.state.generation, iat: now, exp });
    return { ...window, available: true, token, expiresAt: exp, refreshAfterMs: exp - now, deviceWarning: binding.state.switched, qrLogo: ctx.source === 'miu' ? '/assets/img/pics/logo.svg.png' : ctx.club.image, qrLabel: ctx.source === 'miu' ? 'MIU' : ctx.club.name, message: binding.state.switched ? 'This browser has switched accounts. The attendance supervisor will verify your university card.' : 'Show this QR to the attendance supervisor.' };
  }
  async function scan(ref, actor, body, req, res) {
    const saved = await transaction(async session => {
      const ctx = await context.resolve(ref, session, true), access = await permission(ctx, actor, req, res, session);
      const window = await openWindow(ctx, session);
      if (window.state !== 'open') fail(window.state === 'waiting' ? 409 : 410, window.state === 'waiting' ? 'ATTENDANCE_NOT_OPEN' : 'ATTENDANCE_CLOSED', window.state === 'waiting' ? 'Attendance opens ten minutes before the event.' : 'The attendance window has closed.');
      const verifying = Boolean(body.verificationToken), payload = cipher.open(verifying ? body.verificationToken : body.token, verifying ? 'verify' : 'attendance', ctx.key);
      if (verifying && (payload.reviewer !== actor.email || !access.canVerify || body.verifiedIdentity !== true || typeof body.verificationNote !== 'string' || body.verificationNote.trim().length < 5 || body.verificationNote.length > 500)) fail(403, 'VERIFICATION_REQUIRED', 'An authorized supervisor must check the university card and provide a verification note.');
      const student = await StudentAccount.findById(payload.account).session(session).lean();
      if (!student || Number(student.sessionVersion || 0) !== Number(payload.version)) fail(403, 'REVOKED_QR', 'The student session changed. Ask for a refreshed QR.');
      if (!student.name || !student.universityId) fail(422, 'PROFILE_REQUIRED', 'The student must complete their name and official university ID before attendance can be recorded.');
      if (String(actor.email || '').toLowerCase() === student.email.toLowerCase()) fail(403, 'SELF_SCAN_FORBIDDEN', 'Another authorized supervisor must scan your personal attendance QR.');
      const registration = await context.registration(ctx, student, session);
      if (!registration) fail(403, 'NOT_REGISTERED', 'The student is not registered, or the registration was cancelled.');
      if (!await context.eligible(ctx, student, session)) fail(403, 'NOT_ELIGIBLE', 'The student is no longer eligible for this event.');
      const identity = { name: student.name, universityId: student.universityId, registrationStatus: 'registered', eventTitle: ctx.event.title, eventType: ctx.source === 'miu' ? 'University event' : 'Club event' };
      const key = `${ctx.key}:${student._id}`, filter = { clubId: ctx.clubId, itemType: 'event', eventRequestId: ctx.eventRequestId };
      const binding = await DeviceBinding.findOne({ deviceHash: payload.device }).session(session).lean();
      if (!binding || new Date(binding.expiresAt).getTime() <= clock() || binding.state.generation !== payload.generation || binding.state.current !== String(student._id)) fail(403, 'REVOKED_QR', 'The browser account association changed. Ask for a refreshed QR.');
      const existing = await AttendanceRecord.findOne({ ...filter, $or: [{ accountEventKey: key }, { email: student.email }] }).session(session).lean();
      if (existing) return { ...identity, result: 'duplicate', color: 'red', savedToDatabase: false, attendedAt: existing.attendedAt, message: 'Already checked in. Attendance has already been recorded for this event.' };
      if (binding.state.switched && !verifying) {
        const now = clock();
        await audit(actor, 'attendance_verification_required', ctx, { accountId: String(student._id) }, session);
        return { ...identity, result: 'verification_required', color: 'yellow', savedToDatabase: false, canVerify: access.canVerify, verificationToken: access.canVerify ? cipher.seal({ ...payload, purpose: 'verify', reviewer: actor.email, iat: now, exp: Math.min(now + 60000, window.endsAt) }) : undefined, message: 'Account switch detected. Additional verification is required.' };
      }
      const sessionFilter = { ...filter, sourceType: ctx.source, active: true };
      let attendanceSession = await AttendanceSession.findOne({ ...sessionFilter, ...(access.scanSessionId ? { _id: access.scanSessionId } : ctx.source === 'miu' ? { assignedSupervisorEmail: { $ne: '' } } : {}) }).session(session).lean();
      if (ctx.source === 'miu' && !attendanceSession?.assignedSupervisorEmail) fail(409, 'REVIEW_TEAM_REQUIRED', 'Set up this university event’s attendance team before scanning, so records reach its assigned supervisor.');
      if (!attendanceSession) { const [created] = await AttendanceSession.create([{ ...sessionFilter, eventTitle: ctx.event.title, eventDate: ctx.event.date, eventTime: ctx.event.time, attendanceAudience: ctx.event.attendanceAudience === 'members' ? 'members' : 'all_students', tokenHash: crypto.randomBytes(32).toString('hex'), createdBy: actor.email }], { session }); attendanceSession = created; }
      const attendedAt = new Date(clock());
      const { membershipSnapshot } = require('./attendance-participation');
      const membership = await membershipSnapshot(student.email, { Club, Application: deps.Application }, session);
      const organizer = ctx.source === 'club' && await AttendanceAssignment.findOne({ ...filter, memberEmail: student.email, status: 'accepted' }).session(session).lean();
      const usher = ctx.source === 'miu' && await AttendanceSession.findOne({ ...filter, sourceType: 'miu', active: true, assignedMemberEmail: student.email, assignedMemberAccepted: true }).session(session).lean();
      await AttendanceRecord.create([{ ...filter, sessionId: attendanceSession._id, eventTitle: ctx.event.title, eventDate: ctx.event.date, eventTime: ctx.event.time, name: student.name, email: student.email, universityId: student.universityId, major: student.major || '', accountEventKey: key,
        attendedAt, ...membership, supervisorEmail: ctx.source === 'miu' ? attendanceSession.assignedSupervisorEmail : '', approvalStatus: 'pending_supervisor', attendanceAudience: ctx.event.attendanceAudience === 'members' ? 'members' : 'all_students', eventParticipation: { role: organizer ? 'organizer' : usher ? 'usher' : 'attendee' },
        reverseAttendance: { accountId: String(student._id), scannedBy: actor.email, scannedByRole: actor.role || 'admin', verifiedSwitch: verifying, verificationNote: verifying ? body.verificationNote.trim() : '' } }], { session });
      await audit(actor, 'attendance_scanned', ctx, { accountId: String(student._id), verifiedSwitch: verifying }, session);
      return { ...identity, result: 'recorded', color: 'green', savedToDatabase: true, attendedAt, message: 'Attendance recorded successfully.' };
    });
    return saved;
  }
  async function overview(ref, actor, req, res) {
    const ctx = await context.resolve(ref), access = await permission(ctx, actor, req, res);
    let window; try { window = await openWindow(ctx); } catch (error) { if (!error.status) throw error; window = { state: 'closed', message: error.message, serverNow: clock() }; }
    return { ...access, ...window, title: ctx.event.title, date: ctx.event.date, time: ctx.event.time, eventType: ctx.source, registrationCapacity: ctx.event.capacity, settings: ctx.event.attendanceSettings || {}, registrationCount: await EventRegistration.countDocuments(ctx.filter), attendanceCount: await AttendanceRecord.countDocuments({ clubId: ctx.clubId, itemType: 'event', eventRequestId: ctx.eventRequestId }) };
  }
  async function configure(ref, actor, body) {
    return transaction(async session => {
      const ctx = await context.resolve(ref, session, true);
      if (!manager(ctx, actor)) fail(403, 'CAPACITY_FORBIDDEN', 'You cannot change capacity for this event.');
      const capacity = body.capacity;
      if (capacity !== null && (!Number.isSafeInteger(capacity) || capacity < 0 || capacity > 100000)) fail(422, 'INVALID_CAPACITY', 'Capacity must be a whole number from 0 to 100,000, or unlimited.');
      if (body.cancellationEnabled !== undefined && typeof body.cancellationEnabled !== 'boolean') fail(422, 'INVALID_SETTINGS', 'Choose whether registration cancellation is allowed.');
      const settings = { ...ctx.event.attendanceSettings, registrationCapacity: capacity, timeZone: body.timeZone || ctx.event.attendanceSettings?.timeZone || 'Africa/Cairo', endTime: body.endTime || '' };
      settings.cancellationEnabled = body.cancellationEnabled ?? ctx.event.attendanceSettings?.cancellationEnabled ?? ctx.event.cancellationEnabled ?? false;
      attendanceWindow({ ...ctx.event, attendanceSettings: settings }, clock());
      const count = await EventRegistration.countDocuments(ctx.filter).session(session);
      if (ctx.source === 'club') {
        await Club.updateOne({ id: ctx.clubId }, { $set: { [`events.${ctx.eventIndex}.capacity`]: capacity, [`events.${ctx.eventIndex}.attendanceSettings`]: settings } }, { session });
        if (deps.ContentRequest) await deps.ContentRequest.updateOne({ id: ctx.eventRequestId, clubId: ctx.clubId, type: 'event' }, { $set: { attendanceSettings: settings } }, { session });
      }
      else await UniversityContent.updateOne({ id: ctx.event.id, type: 'event' }, { $set: { attendanceSettings: settings } }, { session });
      await audit(actor, 'event_capacity_updated', ctx, { capacity, registeredCount: count, timeZone: settings.timeZone, endTime: settings.endTime }, session);
      return { savedToDatabase: true, capacity, registeredCount: count, full: capacity !== null && count >= capacity, message: capacity !== null && count > capacity ? 'Capacity saved below existing registrations. All existing registrations are preserved; new registration is closed.' : 'Event capacity and attendance schedule saved.' };
    });
  }
  return { context, issue, scan, overview, configure, bindDevice, manager, permission, transaction };
}
module.exports = { createReverseAttendance, createAttendanceCipher, PERIOD };
