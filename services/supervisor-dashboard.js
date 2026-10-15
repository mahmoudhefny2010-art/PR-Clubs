const express = require('express');

function assignedIds(account) {
  return account?.role === 'supervisor'
    ? [...new Set((account.assignedClubIds || []).filter(id => Number.isSafeInteger(id) && id > 0))] : [];
}

function registerSupervisorDashboard(app, deps) {
  const { getAccount, databaseReady, Club, ContentRequest, SpeakerRequest, AttendanceRecord, AttendanceSession, Review,
    sameOrigin, publicSpeakerRequest, attendanceClosureMapFor, attendanceActivityKey, isAttendanceActivityEnded } = deps;
  const router = express.Router();
  router.use(async (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      if (!databaseReady()) return res.status(503).json({ message: 'Supervisor data is temporarily unavailable.' });
      const account = await getAccount(req);
      if (!account) return res.status(401).json({ message: 'Sign in to your supervisor account.' });
      if (account.role !== 'supervisor') return res.status(403).json({ message: 'Supervisor access required.' });
      req.supervisor = account;
      req.assignedIds = assignedIds(account);
      next();
    } catch { res.status(503).json({ message: 'Could not verify supervisor access.' }); }
  });
  router.get('/clubs', async (req, res) => {
    try {
      const clubs = await Club.find({ id: { $in: req.assignedIds } }).select('id name category status tagline').lean();
      res.json({ clubs });
    } catch { res.status(503).json({ message: 'Could not load assigned clubs.' }); }
  });
  router.get('/miu-attendance', async (req, res) => {
    try {
      const records = await AttendanceRecord.find({ clubId: 0, supervisorEmail: req.supervisor.email, approvalStatus: 'pending_supervisor' }).sort({ attendedAt: -1 }).lean();
      const closureMap = await attendanceClosureMapFor(records);
      const reviewable = records.filter(record => isAttendanceActivityEnded(record.eventDate) || closureMap.has(attendanceActivityKey(record)));
      const groups = new Map();
      for (const record of reviewable) {
        const audience = record.attendanceAudience === 'all_students' ? 'all_students' : 'members';
        const key = `${record.itemType}:${record.eventRequestId}:${audience}`;
        if (!groups.has(key)) groups.set(key, { clubId: 0, clubName: 'MIU events', itemType: record.itemType, eventRequestId: record.eventRequestId,
          eventTitle: record.eventTitle, eventDate: record.eventDate, eventTime: record.eventTime, attendanceAudience: audience, attendanceEnded: true,
          attendanceEndedAt: closureMap.get(attendanceActivityKey(record))?.endedAt || null, records: [] });
        groups.get(key).records.push({ name: record.name, email: record.email, membershipStatus: record.membershipStatus,
          memberClubNames: record.memberClubNames || [], eventParticipation: record.eventParticipation, attendedAt: record.attendedAt });
      }
      res.json({ reviews: [...groups.values()] });
    } catch { res.status(503).json({ message: 'Could not load MIU attendance assigned to your supervisor account.' }); }
  });
  router.post('/miu-attendance/:eventRequestId/decision', async (req, res) => {
    if (!sameOrigin(req)) return res.status(403).json({ message: 'Reload and try again.' });
    const attendanceAudience = req.body.attendanceAudience || 'all_students';
    if (!['members', 'all_students'].includes(attendanceAudience)) return res.status(400).json({ message: 'Choose a valid attendance list.' });
    const eventRequestId = Number(req.params.eventRequestId), action = req.body.action;
    const comment = typeof req.body.comment === 'string' ? req.body.comment.trim().slice(0, 500) : '';
    if (!Number.isSafeInteger(eventRequestId) || eventRequestId <= 0 || !['approve', 'reject'].includes(action) || action === 'reject' && !comment) {
      return res.status(400).json({ message: 'Choose a decision and provide a reason for rejection.' });
    }
    try {
      const filter = { clubId: 0, itemType: 'event', eventRequestId, attendanceAudience, supervisorEmail: req.supervisor.email, approvalStatus: 'pending_supervisor' };
      const records = await AttendanceRecord.find(filter).select('sessionId eventDate').lean();
      if (!records.length) return res.status(409).json({ message: 'This MIU attendance list is no longer assigned to you.' });
      const closureMap = await attendanceClosureMapFor(records.map(record => ({ ...record, clubId: 0, itemType: 'event', eventRequestId })));
      if (records.some(record => !isAttendanceActivityEnded(record.eventDate)
        && !closureMap.has(attendanceActivityKey({ ...record, clubId: 0, itemType: 'event', eventRequestId })))) {
        return res.status(409).json({ message: 'End MIU event attendance before reviewing its check-in list.' });
      }
      const sessions = await AttendanceSession.find({ _id: { $in: records.map(record => record.sessionId) } }).select('createdBy assignedMemberEmail').lean();
      if (sessions.some(session => session.createdBy === req.supervisor.email || session.assignedMemberEmail === req.supervisor.email)) return res.status(403).json({ message: 'You cannot review attendance for an event you created or operated.' });
      const status = action === 'approve' ? 'pending_pr' : 'rejected';
      const result = await AttendanceRecord.updateMany(filter, { $set: { approvalStatus: status }, $push: { approvalHistory: {
        role: 'supervisor', email: req.supervisor.email, action: action === 'approve' ? 'approved' : 'rejected', note: comment, createdAt: new Date()
      } } });
      if (!result.modifiedCount) return res.status(409).json({ message: 'This list was already reviewed. Refresh and try again.' });
      try { await deps.notifyAttendance?.({ clubId: 0, itemType: 'event', eventRequestId, attendanceAudience }, status, action); } catch {}
      res.json({ status, recordsUpdated: result.modifiedCount });
    } catch { res.status(503).json({ message: 'The MIU attendance decision could not be saved.' }); }
  });
  router.use('/clubs/:clubId', (req, res, next) => {
    const id = Number(req.params.clubId);
    if (!/^\d+$/.test(req.params.clubId) || !req.assignedIds.includes(id)) {
      return res.status(404).json({ message: 'Assigned club not found.' });
    }
    req.supervisorClubId = id;
    next();
  });
  router.get('/clubs/:clubId', async (req, res) => {
    try {
      const clubId = req.supervisorClubId;
      const club = await Club.findOne({ id: clubId }).select('id name category description status events').lean();
      if (!club) return res.status(404).json({ message: 'Assigned club not found.' });
      const [requests, speakers, attendance, reviews] = await Promise.all([
        ContentRequest.aggregate([{ $match: { clubId } }, { $sort: { createdAt: -1 } }, { $project: {
          ...Object.fromEntries('id clubId type title description date time location status clubNotice comments supervisorNextStage createdAt updatedAt'.split(' ').map(key => [key, 1])),
          image: { $cond: [{ $and: [{ $eq: ['$type', 'feed'] }, { $regexMatch: { input: { $ifNull: ['$image', ''] }, regex: '^https://res[.]cloudinary[.]com/[^/]+/video/upload/' } }] }, '$image', ''] }
        } }]),
        SpeakerRequest.find({ clubId }).sort({ submittedAt: -1 }).lean(),
        AttendanceRecord.aggregate([{ $match: { clubId } }, { $group: {
          _id: { eventRequestId: '$eventRequestId', itemType: '$itemType', approvalStatus: '$approvalStatus', attendanceAudience: '$attendanceAudience' },
          title: { $first: '$eventTitle' }, date: { $first: '$eventDate' }, count: { $sum: 1 },
          people: { $push: { name: '$name', email: '$email', membershipStatus: '$membershipStatus', memberClubNames: '$memberClubNames', eventParticipation: '$eventParticipation', attendedAt: '$attendedAt' } }
        } }]),
        Review.find({ clubId, supervisorId: req.supervisor._id }).sort({ updatedAt: -1 }).lean()
      ]);
      // Events are projected explicitly; never expose embedded registration or attendee data.
      club.events = (club.events || []).map((event, index) => ({ index, title: event.title, date: event.date,
        time: event.time, location: event.location, description: event.description, requestId: event.requestId }));
      res.json({ club, requests, speakers: speakers.map(publicSpeakerRequest), attendance,
        reviews: reviews.map(({ targetType, targetId, note, updatedAt }) => ({ targetType, targetId, note, updatedAt })) });
    } catch { res.status(503).json({ message: 'Could not load club information. Please try again.' }); }
  });
  router.put('/clubs/:clubId/reviews/:targetType/:targetId', async (req, res) => {
    if (!sameOrigin(req)) return res.status(403).json({ message: 'Reload the page and try again.' });
    const { targetType, targetId } = req.params;
    const note = typeof req.body.note === 'string' ? req.body.note.trim() : '';
    if (!['content', 'speaker'].includes(targetType) || !note || note.length > 2000) {
      return res.status(400).json({ message: 'Enter a review note between 1 and 2000 characters.' });
    }
    if (targetType === 'content' ? !/^\d+$/.test(targetId) : !/^[a-f\d]{24}$/i.test(targetId)) {
      return res.status(404).json({ message: 'Request not found.' });
    }
    try {
      const clubId = req.supervisorClubId;
      const model = targetType === 'content' ? ContentRequest : SpeakerRequest;
      const filter = targetType === 'content' ? { id: Number(targetId), clubId } : { _id: targetId, clubId };
      if (!await model.exists(filter)) return res.status(404).json({ message: 'Request not found.' });
      const review = await Review.findOneAndUpdate({ clubId, supervisorId: req.supervisor._id, targetType, targetId },
        { $set: { note, supervisorEmail: req.supervisor.email } }, { upsert: true, new: true, runValidators: true });
      res.json({ targetType, targetId, note: review.note, updatedAt: review.updatedAt });
    } catch { res.status(503).json({ message: 'Your review note could not be saved.' }); }
  });
  require('./supervisor-workflow').registerSupervisorDecisions(router, deps);
  app.use('/api/supervisor', router);
}

module.exports = { assignedIds, registerSupervisorDashboard };
