function registerMiuEventAdmin(app, deps) {
  const { UniversityContent, EventRegistration, databaseReady, requireMiuEventsDashboard } = deps;
  app.use('/api/miu-events', requireMiuEventsDashboard);
  require('./university-content-admin').registerUniversityContentAdmin(app, deps, '/api/miu-events/content');
  app.get('/api/miu-events/registrations', async (req, res) => {
    try {
      if (!databaseReady()) return res.status(503).json({ message: 'MIU event storage is temporarily unavailable.' });
      const [events, registrations] = await Promise.all([
        UniversityContent.find({ type: 'event', registrationEnabled: true }).read('primary').readConcern('majority').sort({ date: 1, id: 1 }).lean(),
        EventRegistration.find({ clubId: 0 }).read('primary').readConcern('majority').sort({ createdAt: -1 }).lean()
      ]);
      res.setHeader('Cache-Control', 'no-store');
      res.json(events.map(event => ({
        id: event.id, title: event.title, date: event.date || '', time: event.time || '', location: event.location || '',
        registrations: registrations.filter(registration => registration.eventIndex === event.id
          && (registration.eventRequestId === event.id || registration.eventRequestId == null
            && (!registration.eventTitle || registration.eventTitle === event.title)))
          .map(registration => ({ name: registration.name, email: registration.email, registeredAt: registration.createdAt }))
      })));
    } catch (error) {
      console.error('MIU event registrations read failed:', error.name);
      res.status(503).json({ message: 'Could not load MIU event registrations right now.' });
    }
  });
}

module.exports = { registerMiuEventAdmin };
