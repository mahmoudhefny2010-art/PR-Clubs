const { sanitizePublicClub, publicClubProjection } = require('./public-club-media');
const { organization, toPublicUniversityContent } = require('./university-content');

const pageSizes = Object.freeze({ feed: 10, events: 8, sponsors: 8, booths: 10, updates: 10 });
function positive(value, fallback, maximum = 1000000000) {
  return /^\d+$/.test(String(value)) && Number.isSafeInteger(Number(value)) && Number(value) > 0
    ? Math.min(Number(value), maximum) : fallback;
}
function options(section, query = {}) {
  if (!Object.hasOwn(pageSizes, section)) return null;
  return { section, page: positive(query.page, 1), pageSize: positive(query.pageSize, pageSizes[section], 50),
    filter: ['all', 'events', 'announcements', 'activities'].includes(query.filter) ? query.filter : 'all',
    q: String(query.q || '').trim().slice(0, 200), clubId: positive(query.clubId, 0, Number.MAX_SAFE_INTEGER),
    post: positive(query.post, 0, Number.MAX_SAFE_INTEGER), today: new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(new Date()) };
}
function metadata(total, requested, pageSize) {
  const totalPages = Math.ceil(total / pageSize);
  return { page: Math.min(Math.max(1, requested), totalPages || 1), pageSize, totalItems: total, totalPages };
}
function serialize(row) {
  // SQL persists BSON Extended JSON, including {$date: ...} timestamps.
  // Decode with the same codec as the normal database model reads.
  let item = typeof row.item === 'string' ? require('mongoose').mongo.BSON.EJSON.parse(row.item) : row.item;
  if (row.university) {
    item = toPublicUniversityContent(item);
  } else {
    item = sanitizePublicClub({ [row.collection]: [item] })[row.collection][0];
    for (const field of ['image', 'sponsorLogo']) if (/^data:[\w.+/-]+;base64,/.test(item[field] || '')) {
      item[field] = `/api/public-club-media/${row.clubId}/${row.collection}/${row.index}/${field}?v=${new Date(row.updatedAt || 0).getTime()}`;
    }
  }
  return { club: { id: Number(row.clubId), name: row.university ? organization.name : row.clubName,
    image: row.university ? organization.image : row.clubImage }, item,
    index: Number(row.index), collection: row.collection, university: Boolean(row.university) };
}

const date = input => ({ $convert: { input, to: 'date', onError: null, onNull: null } });
const nonempty = input => ({ $ne: [{ $trim: { input: { $ifNull: [input, ''] } } }, ''] });
function mongoPipeline(Club, UniversityContent, o) {
  const names = o.section === 'feed' ? ['events', 'posts'] : o.section === 'updates' ? ['posts'] : [o.section];
  const branches = names.map(collection => ({ $map: { input: { $range: [0, { $size: { $ifNull: [`$${collection}`, []] } }] }, as: 'index',
    in: { item: { $arrayElemAt: [`$${collection}`, '$$index'] }, index: '$$index', collection } } }));
  const pipeline = [{ $match: { archivedAt: null, ...(o.clubId ? { id: o.clubId } : {}) } },
    { $project: { ...publicClubProjection(), updatedAt: 1 } },
    { $project: { clubId: '$id', clubName: '$name', clubImage: '$image', updatedAt: 1, rows: { $concatArrays: branches } } },
    { $unwind: '$rows' }, { $project: { _id: 0, clubId: 1, clubName: 1, clubImage: 1, updatedAt: 1,
      item: '$rows.item', index: '$rows.index', collection: '$rows.collection', university: { $literal: false } } }];
  if (['feed', 'events', 'updates'].includes(o.section) && !o.clubId) pipeline.push({ $unionWith: {
    coll: UniversityContent.collection.name, pipeline: [{ $match: { type: o.section === 'events' ? 'event' : o.section === 'updates' ? 'announcement' : { $in: ['event', 'announcement'] } } },
      { $project: { _id: 0, item: '$$ROOT', index: '$id', collection: { $cond: [{ $eq: ['$type', 'event'] }, 'events', 'posts'] },
        clubId: { $literal: 0 }, university: { $literal: true } } }] } });
  pipeline.push({ $match: { item: { $type: 'object' } } }, { $set: { eventDate: date('$item.date'),
    created: date('$item.createdAt'),
    published: date({ $ifNull: ['$item.publishedAt', { $ifNull: ['$item.createdAt', { $ifNull: ['$item.submittedAt', '$item.date'] }] }] }),
    opening: date({ $ifNull: ['$item.boothOpenDate', '$item.date'] }),
    requestId: { $convert: { input: '$item.requestId', to: 'double', onError: 0, onNull: 0 } },
    announcement: { $or: ['$university', { $regexMatch: { input: { $toLower: { $ifNull: ['$item.type', { $ifNull: ['$item.category', { $ifNull: ['$item.kind', ''] }] }] } }, regex: 'announcement|notice' } }] } } });
  const expressions = [];
  if (['events', 'feed'].includes(o.section)) expressions.push({ $or: ['$university', { $and: [
    { $cond: [{ $eq: ['$collection', 'events'] }, { $ne: ['$eventDate', null] }, { $or: [nonempty('$item.title'), nonempty('$item.text'), nonempty('$item.description')] }] },
    ...(o.section === 'feed' ? [{ $or: [{ $ne: ['$collection', 'events'] }, nonempty('$item.title')] }] : [])] }] });
  if (o.section === 'updates') expressions.push({ $ne: ['$published', null] });
  if (o.section === 'feed' && o.filter !== 'all') expressions.push(o.filter === 'events'
    ? { $and: [{ $eq: ['$collection', 'events'] }, { $or: [{ $gte: ['$eventDate', date(o.today)] }, { $and: ['$university', { $eq: ['$eventDate', null] }] }] }] }
    : { $and: [{ $eq: ['$collection', 'posts'] }, o.filter === 'announcements' ? '$announcement' : { $not: ['$announcement'] }] });
  if (expressions.length) pipeline.push({ $match: { $expr: { $and: expressions } } });
  if (o.q) pipeline.push({ $match: { $or: ['item.title', 'item.text', 'item.description', 'clubName'].map(key => ({ [key]: { $regex: o.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } })) } });
  pipeline.push({ $set: { missingDate: { $eq: [o.section === 'booths' ? '$opening' : '$eventDate', null] } } });
  const sort = o.section === 'events' ? { published: -1 }
    : o.section === 'booths' ? { missingDate: 1, opening: 1, created: -1, requestId: -1 }
      : o.section === 'sponsors' ? { created: -1, requestId: -1 } : { published: -1 };
  pipeline.push({ $setWindowFields: { sortBy: { ...sort, university: 1, clubId: 1, collection: 1, index: 1 }, output: { position: { $sum: 1, window: { documents: ['unbounded', 'current'] } } } } },
    { $facet: { meta: [{ $count: 'total' }], items: [{ $skip: (o.page - 1) * o.pageSize }, { $limit: o.pageSize }],
      target: [{ $match: { university: true, 'item.id': o.post || -1 } }, { $limit: 1 }, { $project: { position: 1 } }] } });
  return pipeline;
}
async function readMongo(Club, UniversityContent, o) {
  const run = opts => Club.aggregate(mongoPipeline(Club, UniversityContent, opts)).read('primary').readConcern('majority');
  let [result] = await run(o);
  const target = result.target[0]?.position;
  let meta = metadata(result.meta[0]?.total || 0, target ? Math.ceil(target / o.pageSize) : o.page, o.pageSize);
  if (meta.page !== o.page) [result] = await run({ ...o, page: meta.page, post: 0 });
  meta = metadata(result.meta[0]?.total || 0, meta.page, o.pageSize);
  return { items: result.items.map(serialize), pagination: meta };
}
function registerPublicContentPagination(app, { Club, UniversityContent, readPage, ensureReady, requireLiveDatabase }) {
  app.get('/api/public-content/:section', async (req, res) => {
    const o = options(req.params.section, req.query);
    if (!o) return res.status(404).json({ message: 'Unknown content section.' });
    try {
      await ensureReady();
      if (!requireLiveDatabase(res)) return;
      const result = readPage ? await readPage(o) : await readMongo(Club, UniversityContent, o);
      res.setHeader('Cache-Control', 'no-store');
      res.json(result);
    } catch (error) {
      console.error('Public content page failed:', error.name);
      res.status(503).json({ message: 'Content is temporarily unavailable. Please try again.' });
    }
  });
}
module.exports = { pageSizes, options, metadata, serialize, mongoPipeline, readMongo, registerPublicContentPagination };
