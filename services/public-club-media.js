// Replace embedded media in public listing responses inside MongoDB, before
// large base64 values cross the database connection. Stored data is unchanged.
const collections = new Set(['events', 'posts', 'sponsors', 'booths']);
const fields = new Set(['image', 'sponsorLogo', 'sponsorAttachment']);
const publicFields = 'id sortOrder name committee category tagline image imagePublicId imageFit status applicationCycleStartedAt pinned seats members committeeAvailability description requirements applicationIntro applicationFields interviewForms events posts sponsors booths memberRoster.email';

function publicClubProjection() {
  const projection = Object.fromEntries(publicFields.split(' ').map((field) => [field, 1]));
  for (const collection of collections) {
    const replacements = {};
    for (const field of fields) {
      const value = `$$item.${field}`;
      replacements[field] = { $cond: [
        { $regexMatch: { input: { $convert: { input: value, to: 'string', onError: '', onNull: '' } }, regex: '^data:[\\w.+/-]+;base64,' } },
        { $concat: ['/api/public-club-media/', { $toString: '$id' }, `/${collection}/`,
          { $toString: '$$mediaIndex' }, `/${field}?v=`,
          { $toString: { $ifNull: [{ $toLong: '$updatedAt' }, 0] } }] },
        value
      ] };
    }
    projection[collection] = { $cond: [{ $isArray: `$${collection}` }, { $map: {
      input: { $range: [0, { $size: { $ifNull: [`$${collection}`, []] } }] }, as: 'mediaIndex',
      in: { $let: { vars: { item: { $arrayElemAt: [`$${collection}`, '$$mediaIndex'] } },
        in: { $cond: [{ $eq: [{ $type: '$$item' }, 'object'] },
          { $mergeObjects: ['$$item', replacements] }, '$$item'] } } }
    } }, `$${collection}`] };
  }
  return projection;
}

function registerPublicClubMedia(app, { Club, requireLiveDatabase }) {
  app.get('/api/public-club-media/:clubId/:collection/:index/:field', async (req, res) => {
    const { collection, field } = req.params;
    const clubId = Number(req.params.clubId);
    const index = Number(req.params.index);
    const version = Number(req.query.v);
    if (!collections.has(collection) || !fields.has(field)
      || !Number.isSafeInteger(clubId) || clubId < 1 || !Number.isSafeInteger(index) || index < 0
      || !/^\d+$/.test(String(req.query.v)) || !Number.isSafeInteger(version) || version < 0
      || !Number.isFinite(new Date(version).getTime())) return res.status(400).end();
    if (!requireLiveDatabase(res)) return;
    try {
      const [record] = await Club.aggregate([
        { $match: { id: clubId, archivedAt: null,
          ...(version ? { updatedAt: new Date(version) } : { updatedAt: null }) } },
        { $project: { _id: 0, value: { $let: {
          vars: { item: { $arrayElemAt: [`$${collection}`, index] } }, in: `$$item.${field}`
        } } } }
      ]).read('primary').readConcern('majority');
      const match = typeof record?.value === 'string'
        && /^data:([\w.+/-]+);base64,([A-Za-z0-9+/=\r\n]+)$/.exec(record.value);
      if (!match) return res.status(404).end();
      const bytes = Buffer.from(match[2], 'base64');
      const image = /^image\/(?:png|jpeg|jpg|gif|webp|avif|svg\+xml)$/i.test(match[1]);
      const extensions = {
        'application/pdf': 'pdf', 'application/msword': 'doc',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
        'application/vnd.ms-powerpoint': 'ppt',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx'
      };
      const extension = extensions[match[1].toLowerCase()];
      res.setHeader('Content-Type', image || extension ? match[1] : 'application/octet-stream');
      res.setHeader('Content-Disposition', image ? 'inline' : `attachment; filename="attachment.${extension || 'bin'}"`);
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
      res.removeHeader('Pragma');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      return res.send(bytes);
    } catch (error) {
      console.error('Public club media read failed:', error.name);
      return res.status(503).end();
    }
  });
}

module.exports = { publicClubProjection, registerPublicClubMedia, publicFields };
