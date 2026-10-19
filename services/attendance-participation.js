const labels = { attendee: 'Attendee', organizer: 'Organizer', usher: 'Usher', president: 'President', head: 'Head' };
function eventRoleLabel(record) { const role = record?.eventParticipation?.role; return Object.hasOwn(labels, role) ? labels[role] : 'Attendee'; }
function attendanceCategory(record) {
  const role = record?.eventParticipation?.role;
  if (role === 'organizer' || role === 'usher') return labels[role];
  return record?.membershipStatus === 'member' ? 'Member' : record?.membershipStatus === 'non_member' ? 'Non-member' : '';
}
async function membershipSnapshot(email, { Club, Application }, session) {
  const normalized = String(email || '').trim().toLowerCase();
  const rosterQuery = Club.find({ archivedAt: null, 'memberRoster.email': normalized }).select('id name memberRoster');
  const applicationQuery = Application.find({ email: normalized, status: 'accepted' }).select('clubId');
  if (session) { rosterQuery.session(session); applicationQuery.session(session); }
  // A transaction uses one SQL connection; do not start concurrent requests on it.
  const roster = await rosterQuery.lean();
  const applications = await applicationQuery.lean();
  const ids = [...new Set(applications.map(record => Number(record.clubId)))];
  const acceptedQuery = ids.length ? Club.find({ archivedAt: null, id: { $in: ids } }).select('id name') : null;
  if (session && acceptedQuery) acceptedQuery.session(session);
  const accepted = acceptedQuery ? await acceptedQuery.lean() : [];
  const names = [...new Set([...roster, ...accepted].map(club => club.name).filter(Boolean))];
  return { membershipStatus: names.length ? 'member' : 'non_member', memberClubNames: names };
}

function registerUsherSelfCheckin(app, deps) {
  const { requireAttendanceTaskAuth, requireLiveDatabase, sameOrigin, AttendanceSession, AttendanceRecord, StudentAccount,
    UniversityContent, isActivityScheduledToday, isAttendanceActivityManuallyEnded, bindUsherDevice, attendanceDeviceHashes,
    cleanText } = deps;
  app.post('/api/miu-attendance-task/check-in', requireAttendanceTaskAuth, async (req, res) => {
    if (!sameOrigin(req)) return res.status(403).json({ message: 'Reload this page and try again.' });
    try {
      if (!requireLiveDatabase(res)) return;
      const account = req.attendanceTaskAccount, email = account.email.trim().toLowerCase();
      const session = await AttendanceSession.findOne({ sourceType: 'miu', active: true, assignedMemberEmail: email, assignedMemberAccepted: true }).sort({ createdAt: -1 }).lean();
      if (!session) return res.status(403).json({ message: 'Accept your assigned usher task before recording your attendance.' });
      if (!isActivityScheduledToday(session.eventDate) || await isAttendanceActivityManuallyEnded(0, 'event', session.eventRequestId)) return res.status(410).json({ message: 'Attendance has ended for this MIU event.' });
      if (!await UniversityContent.exists({ id: session.eventRequestId, type: 'event', date: session.eventDate, attendanceEnabled: true })) return res.status(410).json({ message: 'This MIU event is no longer available for attendance.' });
      if (!await bindUsherDevice(session, email, req, res)) return res.status(403).json({ message: 'Use the device where you first opened this usher task.' });
      const profile = await StudentAccount.findOne({ email }).select('name universityId major').lean();
      const name = cleanText(profile?.name || account.name || req.body.name, 160);
      const universityId = cleanText(profile?.universityId || req.body.universityId, 40);
      const major = cleanText(profile?.major || req.body.major, 120);
      if (!name || !universityId || !major) return res.status(400).json({ message: 'Enter your full name, MIU ID and major.' });
      const hashes = attendanceDeviceHashes(req, res), deviceHash = hashes[0];
      const activity = { clubId: 0, itemType: 'event', eventRequestId: session.eventRequestId };
      const existing = await AttendanceRecord.findOne({ ...activity, $or: [{ email }, { deviceHash: { $in: hashes } }] }).select('+deviceHash').lean();
      if (existing && existing.email !== email) return res.status(409).json({ message: 'Attendance has already been recorded from this device for this event.' });
      if (existing?.deviceHash && !hashes.includes(existing.deviceHash)) return res.status(409).json({ message: 'Your attendance for this event is tied to another device.' });
      const eventParticipation = { role: 'usher' };
      if (existing) {
        const saved = await AttendanceRecord.findOneAndUpdate({ _id: existing._id, email }, { $set: { eventParticipation } }, { new: true, runValidators: true }).read('primary').readConcern('majority').lean();
        if (saved?.eventParticipation?.role !== 'usher') throw new Error('Usher role not confirmed');
        return res.json({ savedToDatabase: true, alreadyRecorded: true, message: 'Your attendance is recorded as an usher.' });
      }
      const membership = await membershipSnapshot(email, deps);
      // Recheck closure immediately before writing, as with ordinary attendance.
      if (await isAttendanceActivityManuallyEnded(0, 'event', session.eventRequestId)) return res.status(410).json({ message: 'Attendance has ended for this MIU event.' });
      const record = await AttendanceRecord.create({ ...activity, sessionId: session._id,
        eventTitle: session.eventTitle, eventDate: session.eventDate, eventTime: session.eventTime,
        attendanceAudience: session.attendanceAudience || 'members', ...membership, eventParticipation,
        supervisorEmail: session.assignedSupervisorEmail || '', name, email, universityId, major, deviceHash, attendedAt: new Date() });
      const saved = await AttendanceRecord.findById(record._id).select('email eventParticipation').read('primary').readConcern('majority').lean();
      if (saved?.email !== email || saved?.eventParticipation?.role !== 'usher') throw new Error('Usher attendance not confirmed');
      res.setHeader('Cache-Control', 'no-store');
      res.status(201).json({ savedToDatabase: true, message: 'Your attendance was recorded as an usher.' });
    } catch (error) {
      if (error.code === 11000) return res.status(409).json({ message: 'This email or device already has attendance for this event. Refresh to view its status.' });
      console.error('Usher attendance failed:', error.code || error.name);
      res.status(503).json({ message: 'Your attendance could not be saved. Please try again.' });
    }
  });
}
module.exports = { eventRoleLabel, attendanceCategory, membershipSnapshot, registerUsherSelfCheckin };
