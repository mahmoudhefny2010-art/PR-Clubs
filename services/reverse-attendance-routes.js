const { fail } = require('./event-attendance-context');
function registerReverseAttendance(app, deps) {
  const { service, requireStudentAuth, actorFor, ready, sameOrigin, Club, UniversityContent, EventRegistration } = deps;
  const buckets = new Map();
  const safe = (kind, fn) => async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      if (!ready()) fail(503, 'DATABASE_UNAVAILABLE', 'Attendance is temporarily unavailable.');
      if (!['GET', 'HEAD'].includes(req.method) && !sameOrigin(req)) fail(403, 'ORIGIN_REJECTED', 'Reload the attendance page and try again.');
      const actor = kind === 'student' ? req.studentAccount : await actorFor(req, res);
      if (!actor) fail(401, 'SIGN_IN_REQUIRED', 'Sign in to an authorized account.');
      const now = Date.now(), key = `${actor.email}:${kind}`, recent = (buckets.get(key) || []).filter(time => now - time < 60000);
      if (recent.length >= (kind === 'student' ? 120 : 300)) fail(429, 'RATE_LIMITED', 'Too many attendance requests. Please wait a moment.');
      recent.push(now); buckets.set(key, recent);
      if (buckets.size > 2000) for (const [id, times] of buckets) if (now - times.at(-1) > 60000) buckets.delete(id);
      await fn(req, res, actor);
    } catch (error) { res.status(error.status || 503).json({ result: 'rejected', color: 'red', savedToDatabase: false, code: error.status ? error.code : 'ATTENDANCE_UNAVAILABLE', message: error.status ? error.message : 'The attendance operation could not be confirmed. Check the current status before retrying.' }); }
  };
  const ref = req => ({ source: req.params.source, clubId: Number(req.params.clubId), eventIndex: Number(req.params.eventIndex), ...(req.query.eventRequestId !== undefined ? { eventRequestId: req.query.eventRequestId } : {}) });
  const route = '/api/reverse-attendance/:source/:clubId/:eventIndex';
  app.get(route + '/qr', requireStudentAuth, safe('student', async (req, res, student) => res.json(await service.issue(ref(req), student, req, res))));
  app.get(route, safe('scanner', async (req, res, actor) => res.json(await service.overview(ref(req), actor, req, res))));
  app.post(route + '/scan', safe('scanner', async (req, res, actor) => res.json(await service.scan(ref(req), actor, req.body || {}, req, res))));
  app.put(route + '/settings', safe('scanner', async (req, res, actor) => res.json(await service.configure(ref(req), actor, req.body || {}))));
  app.get('/api/reverse-attendance/my-events', requireStudentAuth, safe('student', async (req, res, student) => {
    const registrations = await EventRegistration.find({ email: student.email }).sort({ createdAt: -1 }).limit(500).lean(), items = [];
    for (const registration of registrations) {
      const reference = { source: registration.clubId === 0 ? 'miu' : 'club', clubId: registration.clubId, eventIndex: registration.eventIndex };
      if (reference.source === 'club' && registration.eventRequestId > 0) { const club = await Club.findOne({ id: registration.clubId, archivedAt: null }).select('events').lean(); reference.eventIndex = club?.events?.findIndex(event => Number(event.requestId) === Number(registration.eventRequestId)); }
      try { const ctx = await service.context.resolve(reference); items.push({ ...reference, eventRequestId: ctx.eventRequestId, title: ctx.event.title, date: ctx.event.date, time: ctx.event.time, source: ctx.source, logo: ctx.source === 'miu' ? '/assets/img/pics/logo.svg.png' : ctx.club.image, logoLabel: ctx.source === 'miu' ? 'MIU' : ctx.club.name }); } catch (error) { if (![400, 404].includes(error.status) && error.code !== 'EVENT_ID_MIGRATION_REQUIRED') throw error; }
    }
    res.json({ items });
  }));
  app.get('/api/reverse-attendance/managed-events', safe('scanner', async (req, res, actor) => {
    const [clubs, university] = await Promise.all([Club.find({ archivedAt: null }).select('id name image events').lean(), UniversityContent.find({ type: 'event' }).select('id title date time').lean()]);
    const candidates = [...clubs.flatMap(club => (club.events || []).map((event, eventIndex) => ({ source: 'club', clubId: club.id, eventIndex, title: event.title, date: event.date, time: event.time, logo: club.image, logoLabel: club.name }))), ...university.map(event => ({ source: 'miu', clubId: 0, eventIndex: event.id, title: event.title, date: event.date, time: event.time, logo: '/assets/img/pics/logo.svg.png', logoLabel: 'MIU' }))], items = [];
    for (const item of candidates) { try { const ctx = await service.context.resolve(item); const access = await service.permission(ctx, actor, req, res); items.push({ ...item, eventRequestId: ctx.eventRequestId, ...access }); } catch (error) { if (![403, 404].includes(error.status) && error.code !== 'EVENT_ID_MIGRATION_REQUIRED') throw error; } }
    res.json({ items });
  }));
}
module.exports = { registerReverseAttendance };
