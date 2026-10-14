const test = require('node:test');
const assert = require('node:assert/strict');
const { Readable } = require('node:stream');
const mongoose = require('mongoose');
const { aggregateStream } = require('../database/aggregate-stream');
const { cacheSnapshot } = require('../database/cache-snapshot');
const { catalog } = require('../database/catalog');
const { Query } = require('../database/models');
const runtime = require('../database/runtime');
const values = require('../database/values');
const spec = name => catalog().find(s => s.name === name);

test('MongoDB, SQL Server and Azure SQL register exactly the same HTTP methods, paths and routers offline', () => {
  const report = require('../scripts/verify-provider-routes.cjs').verifyRoutes();
  assert.equal(report.passed, true); assert.ok(report.routeCount > 150);
  assert.deepEqual(report.providers, ['mongodb', 'sqlserver', 'azuresql']);
  for (const route of ['/api/clubs', '/api/auth/login', '/api/password-reset/confirm', '/api/applications', '/api/club/attendance-records']) assert.ok(report.routes.some(r => r.path === route), route);
});
test('both providers share legacy sorting, pinning and role cache normalization without modifying stored data', () => {
  const input = { clubRecords: [{ id: 1, status: 'closed', pinned: true }, { id: 2, status: 'open', pinned: true, sortOrder: '9' }], applicationRecords: [{ id: 1 }], accountRecords: [{ role: 'legacy', email: 'a' }, { role: 'supervisor', email: 'b' }] };
  const snapshot = cacheSnapshot(input, row => ({ ...row }));
  assert.equal(snapshot.clubs[0].sortOrder, 1); assert.equal(snapshot.clubs[0].pinned, false);
  assert.equal(snapshot.clubs[1].sortOrder, 9); assert.equal(snapshot.clubs[1].pinned, true);
  assert.equal(snapshot.clubAccounts[0].role, 'president'); assert.equal(snapshot.clubAccounts[1].committee, '');
  assert.equal(input.clubRecords[0].pinned, true); assert.equal(input.accountRecords[0].role, 'legacy');
});
test('ID-only SQL projections match Mongo projection and cannot return account passwords', () => {
  const record = { _id: new mongoose.Types.ObjectId(), email: 'a@example.test', salt: 'private', passwordHash: 'private' };
  assert.deepEqual(values.projection(record, '_id'), { _id: record._id });
  assert.deepEqual(values.projection(record, { _id: 1 }), { _id: record._id });
  assert.equal(values.projection(record, { _id: 0 }).email, record.email);
});
test('SQL filters apply the same schema trim/lowercase and ObjectId casting as Mongo queries', () => {
  catalog();
  const model = mongoose.models.StudentAccount;
  const id = new mongoose.Types.ObjectId();
  const input = { email: '  STUDENT@EXAMPLE.TEST ', _id: String(id) };
  const mongoFilter = model.find(input).cast(model);
  const sql = require('../database/query').compile(spec('StudentAccount'), input);
  assert.ok(sql.parameters.some(p => p.value === mongoFilter.email));
  assert.ok(sql.parameters.some(p => p.value === String(mongoFilter._id)));
});
test('large membership and attendance ID lists use JSON parameters instead of exceeding SQL parameter limits', () => {
  const { compile } = require('../database/query');
  const ids = Array.from({ length: 2500 }, () => String(new mongoose.Types.ObjectId()));
  const sessions = compile(spec('AttendanceSession'), { _id: { $in: ids } });
  assert.ok(sessions.parameters.length < 10); assert.match(sessions.text, /OPENJSON/);
  assert.ok(sessions.parameters.some(p => p.value === JSON.stringify(ids)));
  const clubs = compile(spec('ClubAccount'), { assignedClubIds: { $in: Array.from({ length: 2500 }, (_, i) => String(i + 1)) } });
  assert.ok(clubs.parameters.length < 10); assert.match(clubs.text, /CROSS JOIN OPENJSON/); assert.match(clubs.text, /WITH \(\[value\] FLOAT/);
});
test('streamed totals include more than 20,000 source records without retaining every input document', async () => {
  async function* rows() { for (let i = 0; i < 25003; i++) yield { clubId: i % 2, value: 2 }; }
  const result = await aggregateStream(rows(), [{ $group: { _id: '$clubId', count: { $sum: 1 }, average: { $avg: '$value' } } }, { $sort: { _id: 1 } }]);
  assert.deepEqual(result, [{ _id: 0, count: 12502, average: 2 }, { _id: 1, count: 12501, average: 2 }]);
});
test('streamed public club, membership, feedback and supervisor report expressions match prior response shaping', async () => {
  const rows = [{ _id: new mongoose.Types.ObjectId(), id: 1, clubId: 1, email: ' A@EXAMPLE.TEST ', value: 4, events: [{ title: 'One', image: 'data:image/png;base64,AAAA' }], updatedAt: new Date(1000) },
    { _id: new mongoose.Types.ObjectId(), id: 2, clubId: 1, email: '', value: 2, events: [] }];
  const pipelines = [
    [{ $project: require('../services/public-club-media').publicClubProjection() }],
    [{ $project: { clubId: 1, email: { $toLower: { $trim: { input: { $ifNull: ['$email', ''] } } } } } }, { $group: { _id: '$clubId', emails: { $addToSet: '$email' }, blankEmailCount: { $sum: { $cond: [{ $eq: ['$email', ''] }, 1, 0] } } } }],
    [{ $group: { _id: '$clubId', average: { $avg: '$value' }, count: { $sum: 1 } } }],
    [{ $group: { _id: { clubId: '$clubId' }, title: { $first: '$id' }, people: { $push: { email: '$email', at: '$updatedAt' } }, count: { $sum: 1 } } }],
    [{ $unwind: '$events' }, { $count: 'count' }]
  ];
  for (const pipeline of pipelines) assert.deepEqual(await aggregateStream(Readable.from(rows), pipeline), values.aggregate(rows, pipeline));
  assert.deepEqual(await aggregateStream(Readable.from([]), [{ $count: 'count' }]), []);
});
test('SQL aggregate request uses a streaming query and preserves complete totals', async t => {
  const original = runtime.request;
  const statements = []; let options;
  runtime.request = () => ({ input() { return this; }, toReadableStream(config) {
    options = config;
    return Readable.from((function* () { for (let i = 0; i < 20001; i++) yield { _payload: mongoose.mongo.BSON.EJSON.stringify({ clubId: 1 }) }; })());
  }, async query(sql) { statements.push(sql); }, cancel() {} });
  t.after(() => { runtime.request = original; });
  const result = await new Query(spec('Application'), 'aggregate', {}, [{ $group: { _id: '$clubId', count: { $sum: 1 } } }]);
  assert.deepEqual(result, [{ _id: 1, count: 20001 }]); assert.equal(options.highWaterMark, 50);
  assert.ok(!statements[0].includes('TOP'));
});
test('a failed streamed SQL read cannot return partially accumulated reports', async t => {
  const original = runtime.request;
  let stream, cancelled = false;
  runtime.request = () => ({ input() { return this; }, toReadableStream() { return stream = new Readable({ objectMode: true, read() {} }); },
    async query() { stream.push({ _payload: mongoose.mongo.BSON.EJSON.stringify({ clubId: 1 }) }); throw Object.assign(new Error('Injected lost SQL connection.'), { code: 'ECONNCLOSED' }); },
    cancel() { cancelled = true; } });
  t.after(() => { runtime.request = original; });
  await assert.rejects(new Query(spec('Application'), 'aggregate', {}, [{ $group: { _id: '$clubId', count: { $sum: 1 } } }]), { code: 'ECONNCLOSED' });
  assert.equal(cancelled, true);
});
test('API comparison preserves record IDs and array order, ignores only declared volatile fields, and hides response values', async () => {
  const { compareApis } = require('../scripts/verify-database-api-parity.cjs');
  const documents = { 'mongo.example.test': { checkedAt: 'first', students: [{ id: '001', name: 'Private student' }] },
    'sql.example.test': { students: [{ name: 'Private student', id: '001' }], checkedAt: 'second' } };
  const fetcher = async url => new Response(JSON.stringify(documents[url.hostname]), { headers: { 'content-type': 'application/json' } });
  const args = { mongoOrigin: 'https://mongo.example.test', sqlOrigin: 'https://sql.example.test', cases: [{ path: '/api/clubs', ignoreFields: ['checkedAt'] }], fetcher };
  assert.equal((await compareApis(args)).passed, true);
  documents['sql.example.test'].students[0].id = '1';
  const different = await compareApis(args); assert.equal(different.passed, false);
  assert.ok(!JSON.stringify(different).includes('Private student'));
  assert.ok(!JSON.stringify(different).includes('001'));
});
test('API comparison rejects matching database outages, authentication HTML, same-origin self-comparison and URL injection', async () => {
  const { compareApis } = require('../scripts/verify-database-api-parity.cjs');
  const args = { mongoOrigin: 'https://mongo.example.test', sqlOrigin: 'https://sql.example.test', cases: [{ path: '/api/clubs' }] };
  const failure = await compareApis({ ...args, fetcher: async () => new Response('{"message":"Unavailable"}', { status: 503, headers: { 'content-type': 'application/json' } }) });
  assert.equal(failure.passed, false);
  await assert.rejects(compareApis({ ...args, sqlOrigin: args.mongoOrigin }), /different staging/);
  await assert.rejects(compareApis({ ...args, cases: [{ path: '//attacker.test/api/clubs' }] }), /same-origin/);
  await assert.rejects(compareApis({ ...args, fetcher: async () => new Response('<html>Login</html>', { headers: { 'content-type': 'text/html' } }) }), /must be JSON/);
});
