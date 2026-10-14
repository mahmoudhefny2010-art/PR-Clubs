function registerMiuEventAdmin(app, deps) {
  const { UniversityContent, databaseReady, sameOrigin, cleanText, parseInteraction, readCloudinaryAsset,
    cloudinary, cloudinaryFolders, cloudinaryConfigured, dispatchPublishedContentNotifications, toApiRecord,
    requireMiuEventsDashboard } = deps;
  app.use('/api/miu-events', requireMiuEventsDashboard);
  app.get('/api/miu-events/content', async (req, res) => {
    try {
      if (!databaseReady()) return res.status(503).json({ message: 'MIU event storage is temporarily unavailable.' });
      res.setHeader('Cache-Control', 'no-store');
      const records = await UniversityContent.find().read('primary').readConcern('majority').sort({ createdAt: -1, id: -1 }).lean();
      res.json(records.map(toApiRecord));
    } catch (error) {
      console.error('MIU Events dashboard read failed:', error.name);
      res.status(503).json({ message: 'Could not load MIU updates right now.' });
    }
  });
  app.post('/api/miu-events/content', async (req, res) => {
    if (!sameOrigin(req)) return res.status(403).json({ message: 'Reload and try again.' });
    if (!databaseReady()) return res.status(503).json({ message: 'MIU event storage is temporarily unavailable.' });
    let interactionFields;
    try { interactionFields = parseInteraction(req.body); }
    catch (error) { return res.status(400).json({ message: error.message }); }
    const type = ['event', 'announcement'].includes(req.body.type) ? req.body.type : '';
    const title = cleanText(req.body.title, 140), description = cleanText(req.body.description, 2000);
    const date = cleanText(req.body.date, 40), time = cleanText(req.body.time, 40), location = cleanText(req.body.location, 160);
    if (!type || !title || !description) return res.status(400).json({ message: 'Enter a title and details.' });
    if (type === 'event' && !['members', 'all_students'].includes(req.body.attendanceAudience)) {
      return res.status(400).json({ message: 'Choose who can register and check in for this MIU event.' });
    }
    let image = '/assets/img/pics/logo.svg.png', imagePublicId = '';
    if (req.body.imageChoice === 'custom') {
      const uploaded = await readCloudinaryAsset(req.body.imageUrl, req.body.imagePublicId, cloudinaryFolders.university);
      if (!uploaded) return res.status(400).json({ message: 'Choose a valid PNG, JPG, or WebP image up to 10 MB.' });
      image = uploaded.url; imagePublicId = uploaded.publicId;
    }
    try {
      const last = await UniversityContent.findOne({}).read('primary').readConcern('majority').sort({ id: -1 }).select('id').lean();
      const record = new UniversityContent({ ...interactionFields, id: (last?.id || 0) + 1, type, title, description, date, time,
        registrationEnabled: type === 'event' && req.body.registrationEnabled === true,
        attendanceEnabled: type === 'event' && req.body.registrationEnabled === true && req.body.attendanceEnabled === true,
        attendanceAudience: type === 'event' ? req.body.attendanceAudience : undefined, location, image, imagePublicId,
        publishedBy: req.clubAccount?.email || 'MIU Events' });
      await record.save({ w: 'majority' });
      const persisted = await UniversityContent.findById(record._id).read('primary').readConcern('majority').lean();
      if (!persisted) throw new Error('MIU event was not confirmed in the database.');
      await dispatchPublishedContentNotifications({ source: 'university', contentId: persisted.id,
        revision: persisted.createdAt?.getTime() || Date.now(), type: persisted.type, title: persisted.title });
      res.setHeader('Cache-Control', 'no-store'); res.status(201).json(toApiRecord(persisted));
    } catch (error) {
      if (imagePublicId && cloudinaryConfigured) cloudinary.uploader.destroy(imagePublicId, { resource_type: 'image' }).catch(() => {});
      console.error('MIU event publish failed:', error.name);
      res.status(503).json({ message: 'Could not publish this update. Please retry.' });
    }
  });
  app.delete('/api/miu-events/content/:id', async (req, res) => {
    if (!sameOrigin(req)) return res.status(403).json({ message: 'Reload and try again.' });
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ message: 'Choose a valid MIU post.' });
    try {
      if (!databaseReady()) return res.status(503).json({ message: 'MIU event storage is temporarily unavailable.' });
      const record = await UniversityContent.findOne({ id }).read('primary').lean();
      if (!record) return res.status(404).json({ message: 'MIU post not found.' });
      const deletion = await UniversityContent.deleteOne({ id }, { writeConcern: { w: 'majority' } });
      if (deletion.deletedCount !== 1 || await UniversityContent.exists({ id }).read('primary').readConcern('majority')) {
        throw new Error('MIU post deletion could not be confirmed.');
      }
      if (record.imagePublicId && cloudinaryConfigured) cloudinary.uploader.destroy(record.imagePublicId, { resource_type: 'image' }).catch(() => {});
      res.setHeader('Cache-Control', 'no-store'); res.status(204).end();
    } catch (error) {
      console.error('MIU event delete failed:', error.name);
      res.status(503).json({ message: 'Could not remove this MIU post.' });
    }
  });
}

module.exports = { registerMiuEventAdmin };
