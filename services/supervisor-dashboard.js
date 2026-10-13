const express = require('express');

function assignedIds(account) {
  return account?.role === 'supervisor'
    ? [...new Set((account.assignedClubIds || []).filter(id => Number.isSafeInteger(id) && id > 0))] : [];
}

function registerSupervisorDashboard(app, deps) {
  const { getAccount, databaseReady, Club, ContentRequest, SpeakerRequest, AttendanceRecord, Review,
    sameOrigin, publicSpeakerRequest } = deps;
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
        ContentRequest.find({ clubId }).select('id clubId type title description date time location status clubNotice comments supervisorNextStage createdAt updatedAt').sort({ createdAt: -1 }).lean(),
        SpeakerRequest.find({ clubId }).sort({ submittedAt: -1 }).lean(),
        AttendanceRecord.aggregate([{ $match: { clubId } }, { $group: {
          _id: { eventRequestId: '$eventRequestId', itemType: '$itemType', approvalStatus: '$approvalStatus' },
          title: { $first: '$eventTitle' }, date: { $first: '$eventDate' }, count: { $sum: 1 }
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
