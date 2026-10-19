// UniversityContent is the existing organization source. Its registration scope
// is clubId=0; there is no separate organization table or student Club record.
const organization = Object.freeze({ id: 0, type: 'university', name: 'Misr International University', image: '/assets/img/pics/logo.svg.png' });
const publicFields = 'id type title description interaction question options date time location image registrationEnabled attendanceEnabled attendanceAudience createdAt updatedAt';
function toPublicUniversityContent(record) {
  const result = Object.fromEntries(publicFields.split(' ').filter(key => Object.hasOwn(record, key)).map(key => [key, record[key]]));
  result.interaction = record.interaction || 'none'; result.question = record.question || ''; result.options = record.options || [];
  result.registrationEnabled = record.type === 'event' && record.registrationEnabled === true;
  result.attendanceEnabled = result.registrationEnabled ? (typeof record.attendanceEnabled === 'boolean' ? record.attendanceEnabled : null) : false;
  result.attendanceAudience = record.type === 'event' ? (record.attendanceAudience === 'members' ? 'members' : 'all_students') : undefined;
  result.organization = organization;
  return result;
}
function registerPublicUniversityContentDetail(app, { UniversityContent, ensureReady, requireLiveDatabase }) {
  app.get('/api/university-content/:id', async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ message: 'Choose a valid university event.' });
    try {
      await ensureReady();
      if (!requireLiveDatabase(res)) return;
      const record = await UniversityContent.findOne({ id, type: 'event' }).select(publicFields).read('primary').readConcern('majority').lean();
      res.setHeader('Cache-Control', 'no-store');
      if (!record) return res.status(404).json({ message: 'This university event is no longer available.' });
      res.json(toPublicUniversityContent(record));
    } catch (error) {
      console.error('University event detail read failed:', error.name);
      res.status(503).json({ message: 'University event details are temporarily unavailable.' });
    }
  });
}
module.exports = { organization, publicFields, toPublicUniversityContent, registerPublicUniversityContentDetail };
