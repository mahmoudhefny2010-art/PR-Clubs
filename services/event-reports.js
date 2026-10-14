const express = require('express');
const mongoose = require('mongoose');
const crypto = require('crypto');
const { assignedIds } = require('./supervisor-dashboard');
const fields = ['summary', 'objectives', 'activities', 'outcomes', 'lessonsLearned'];
const schema = new mongoose.Schema({
  clubId: { type: Number, required: true }, eventKey: { type: String, required: true },
  summary: String, objectives: String, activities: String, outcomes: String, lessonsLearned: String,
  status: { type: String, enum: ['draft', 'submitted', 'changes_requested', 'reviewed'], required: true },
  revision: { type: Number, required: true }, submittedAt: Date, updatedBy: String,
  history: [{ action: String, actor: String, at: Date, note: String }]
}, { timestamps: true });
schema.index({ clubId: 1, eventKey: 1 }, { unique: true });
const EventReport = require('../database').bindModel(mongoose.models.EventReport || mongoose.model('EventReport', schema));
function date(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
function period(start, end) { return date(start) && date(end) && start <= end; }
function eventsFor(club) {
  return (club.events || []).map((event, index) => {
    const requestId = Number(event.requestId);
    const legacy = crypto.createHash('sha256').update(JSON.stringify([index, event.title, event.date])).digest('hex');
    return { key: Number.isSafeInteger(requestId) && requestId > 0 ? `request:${requestId}` : `legacy:${legacy}`,
      attendanceId: Number.isSafeInteger(requestId) && requestId > 0 ? requestId : -(index + 1),
      index, title: String(event.title || ''), date: String(event.date || ''),
      startTime: String(event.startTime || event.time || ''), endTime: String(event.endTime || ''),
      location: String(event.location || ''), description: String(event.description || ''),
      registrationEnabled: event.registrationEnabled, attendanceEnabled: event.attendanceEnabled };
  });
}
function statistics(event, registrations, attendance) {
  // Do not attach old index registrations to a replacement event with a different title.
  const registered = registrations.filter(r => r.eventIndex === event.index && r.eventTitle === event.title);
  const checked = attendance.filter(r => r.eventRequestId === event.attendanceId && (r.itemType || 'event') === 'event'
    && (event.attendanceId > 0 || (r.eventTitle === event.title && r.eventDate === event.date)));
  return {
    registered: registered.length || event.registrationEnabled === true ? registered.length : null,
    verified: checked.length || event.attendanceEnabled === true ? checked.length : null,
    registrationSource: 'EventRegistration (matching index and title)', attendanceSource: 'AttendanceRecord (verified check-ins)'
  };
}
function registerEventReports(app, deps) {
  const { Club, EventRegistration, AttendanceRecord, getAccount, databaseReady, sameOrigin } = deps;
  const Report = deps.Report || EventReport;
  const router = express.Router();
  router.use(async (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      if (!databaseReady()) return res.status(503).json({ message: 'Reporting database is unavailable. Please retry.' });
      const account = await getAccount(req);
      if (!account) return res.status(401).json({ message: 'Sign in to access event reports.' });
      if (!['president', 'supervisor'].includes(account.role)) return res.status(403).json({ message: 'Club president or assigned supervisor access required.' });
      req.reportAccount = account;
      if (req.method !== 'GET' && !sameOrigin(req)) return res.status(403).json({ message: 'Reload the page before saving.' });
      next();
    } catch { res.status(503).json({ message: 'Could not verify reporting access.' }); }
  });
  router.get('/clubs', async (req, res) => {
    try {
      const a = req.reportAccount;
      const clubs = await Club.find({ id: { $in: a.role === 'president' ? [a.clubId] : assignedIds(a) }, archivedAt: null }).select('id name').lean();
      res.json({ clubs, role: a.role });
    } catch { res.status(503).json({ message: 'Could not load clubs.' }); }
  });
  router.use('/clubs/:clubId', (req, res, next) => {
    const a = req.reportAccount, id = Number(req.params.clubId);
    if (!/^\d+$/.test(req.params.clubId) || !(a.role === 'president' ? id === a.clubId : assignedIds(a).includes(id))) return res.status(403).json({ message: 'You do not have reporting access to this club.' });
    req.reportClubId = id; next();
  });
  router.get('/clubs/:clubId', async (req, res) => {
    const { start, end } = req.query;
    if (!period(start, end)) return res.status(400).json({ message: 'Supply valid start and end dates (YYYY-MM-DD), in order.' });
    try {
      const clubId = req.reportClubId;
      const club = await Club.findOne({ id: clubId, archivedAt: null }).select('id name events').lean();
      if (!club) return res.status(404).json({ message: 'Club not found.' });
      const [reports, registrations, attendance] = await Promise.all([
        Report.find({ clubId }).lean(), EventRegistration.find({ clubId }).select('eventIndex eventTitle').lean(),
        AttendanceRecord.find({ clubId, itemType: 'event' }).select('eventRequestId itemType eventTitle eventDate').lean()
      ]);
      const all = eventsFor(club);
      const events = all.filter(e => date(e.date) && e.date >= start && e.date <= end).map(e => ({
        ...e, statistics: statistics(e, registrations, attendance), report: reports.find(r => r.eventKey === e.key) || null
      }));
      res.json({ club: { id: club.id, name: club.name }, start, end, events,
        undatedEvents: all.filter(e => !date(e.date)).length,
        overview: { events: events.length, reported: events.filter(e => e.report && e.report.status !== 'draft').length,
          registered: events.reduce((n, e) => n + (e.statistics.registered || 0), 0),
          verified: events.reduce((n, e) => n + (e.statistics.verified || 0), 0),
          missingRegistration: events.filter(e => e.statistics.registered === null).length,
          missingAttendance: events.filter(e => e.statistics.verified === null).length } });
    } catch { res.status(503).json({ message: 'Could not load reports and statistics. No totals are available.' }); }
  });
  router.put('/clubs/:clubId/events/:eventKey', async (req, res) => {
    const a = req.reportAccount, body = req.body || {};
    if (!Number.isSafeInteger(body.revision) || body.revision < 0) return res.status(400).json({ message: 'A valid report revision is required.' });
    const review = a.role === 'supervisor';
    if (! (review ? ['reviewed', 'changes_requested'] : ['draft', 'submitted']).includes(body.status)) return res.status(400).json({ message: 'Invalid report status.' });
    const values = {};
    if (!review) for (const field of fields) {
      if (typeof body[field] !== 'string' || body[field].trim().length > 5000 || (body.status === 'submitted' && !body[field].trim())) return res.status(400).json({ message: `Enter ${field} (maximum 5000 characters; required for submission).` });
      values[field] = body[field].trim();
    }
    if (review && (typeof body.note !== 'string' || body.note.trim().length > 2000 || !body.note.trim())) return res.status(400).json({ message: 'A review note of 1–2000 characters is required.' });
    try {
      const clubId = req.reportClubId, eventKey = req.params.eventKey;
      const club = await Club.findOne({ id: clubId, archivedAt: null }).select('events').lean();
      if (!club || !eventsFor(club).some(e => e.key === eventKey)) return res.status(404).json({ message: 'Existing club event not found.' });
      const now = new Date();
      const update = { ...values, status: body.status, updatedBy: a.email };
      if (body.status === 'submitted') update.submittedAt = now;
      const history = { action: body.status, actor: a.email, at: now, note: review ? body.note.trim() : '' };
      let report;
      if (body.revision === 0 && !review) {
        report = await Report.create({ clubId, eventKey, ...update, revision: 1, history: [history] });
      } else {
        report = await Report.findOneAndUpdate({ clubId, eventKey, revision: body.revision,
          status: { $in: review ? ['submitted'] : ['draft', 'changes_requested'] } },
        { $set: update, $inc: { revision: 1 }, $push: { history } }, { new: true, runValidators: true });
        if (!report) return res.status(409).json({ message: 'Report changed or is locked. Reload before editing. Submitted reports require supervisor changes_requested before editing.' });
      }
      res.json({ report });
    } catch (error) {
      res.status(error.code === 11000 ? 409 : 503).json({ message: error.code === 11000 ? 'A report already exists. Reload before editing.' : 'The report could not be saved. Reload to check its status before retrying.' });
    }
  });
  app.use('/api/event-reports', router);
}
module.exports = { registerEventReports, EventReport, date, period, eventsFor, statistics, fields };
