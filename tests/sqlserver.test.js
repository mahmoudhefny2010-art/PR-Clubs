const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const mongoose = require('mongoose');
const { sqlConfig, provider } = require('../database/config');
const { catalog } = require('../database/catalog');
const { compile } = require('../database/query');
const v = require('../database/values');
const { schemaSql } = require('../scripts/sqlserver-schema.cjs');
const { preflight, canonical, protectedPath, backupEvidence, verifyTarget } = require('../scripts/sqlserver-migrate.cjs');
const { stored, Query } = require('../database/models');
const runtime = require('../database/runtime');
const specs = catalog();
const spec = name => specs.find(s => s.name === name);
const env = { SQLSERVER_HOST: 'localhost', SQLSERVER_DATABASE: 'test_only', SQLSERVER_USER: 'test_user', SQLSERVER_PASSWORD: 'test_only_password' };

test('provider defaults to Mongo; SQL credentials are required only when explicitly connecting', () => {
  assert.equal(provider({}), 'mongodb');
  assert.throws(() => provider({ DATABASE_PROVIDER: 'typo' }), /DATABASE_PROVIDER/);
  assert.throws(() => sqlConfig({}), /SQLSERVER_HOST/);
  assert.throws(() => sqlConfig({ ...env, SQLSERVER_PASSWORD: 'YOUR_DATABASE_PASSWORD' }), /SQLSERVER_PASSWORD/);
  const config = sqlConfig(env);
  assert.equal(config.options.encrypt, true); assert.equal(config.options.trustServerCertificate, false);
  assert.equal(config.pool.max, 5);
});
test('SQL configuration rejects unverified production TLS, bad ports and unsupported identity modes', () => {
  assert.throws(() => sqlConfig({ ...env, NODE_ENV: 'production', SQLSERVER_TRUST_SERVER_CERTIFICATE: 'true' }), /verified TLS/);
  assert.throws(() => sqlConfig({ ...env, SQLSERVER_PORT: '0' }), /out of range/);
  assert.throws(() => sqlConfig({ ...env, SQLSERVER_PORT: '1433;drop table' }), /out of range/);
  assert.throws(() => sqlConfig({ ...env, SQLSERVER_ENCRYPT: 'yes' }), /true or false/);
  assert.throws(() => sqlConfig({ ...env, SQLSERVER_AUTH_MODE: 'windows' }), /SQL authentication/);
});
test('generated DDL accounts for all declared models, uniqueness, references, global scope and retained review history', () => {
  const sql = schemaSql();
  assert.equal(fs.readFileSync(path.resolve(__dirname, '../database/migrations/001-platform.sql'), 'utf8'), sql);
  assert.equal(specs.length, 35);
  assert.ok(specs.some(model => model.name === 'QuizSubmission'));
  for (const s of specs) assert.ok(sql.includes(`CREATE TABLE ${s.table}`), s.name);
  assert.match(sql, /FK_AttendanceRecord_sessionId/);
  assert.match(sql, /FK_Application_studentAccountId/);
  assert.match(sql, /ON DELETE SET NULL/);
  assert.doesNotMatch(sql, /FOREIGN KEY \(\[supervisorId\]\)/);
  assert.match(sql, /\[clubId\] = 0 AND \[_clubReference\] IS NULL/);
  assert.match(sql, /_has_googleSub/);
  assert.match(sql, /WHERE \[stableToken\] = 1 AND \[revokedAt\] IS NULL/);
  assert.match(sql, /non-empty database/);
  assert.doesNotMatch(sql, /\bDROP\b|\bTRUNCATE\b|DELETE FROM/i);
});
test('SQL predicates bind attacker-controlled values and reject identifier/operator injection', () => {
  const attack = "' OR 1=1; --";
  const query = compile(spec('StudentAccount'), { email: attack });
  const model = mongoose.models.StudentAccount;
  const normalized = model.find({ email: attack }).cast(model).email;
  assert.ok(!query.text.includes(attack)); assert.ok(!query.text.includes(normalized));
  assert.ok(query.parameters.some(p => p.value === normalized));
  assert.throws(() => compile(spec('StudentAccount'), { 'email]; DROP': 'x' }), /field path/);
  assert.throws(() => compile(spec('StudentAccount'), { email: { $regex: '.*' } }), /Unsupported/);
  assert.throws(() => compile(spec('StudentAccount'), { __proto__: null, constructor: 'x' }), /field path/);
});
test('query compilation preserves null/missing checks, trailing-space equality and nested role scopes', () => {
  assert.match(compile(spec('Club'), { archivedAt: null }).text, /IS NULL/);
  assert.match(compile(spec('Club'), { archivedAt: { $ne: null } }).text, /IS NOT NULL/);
  assert.match(compile(spec('SpeakerRequest'), { activeRequesterKey: { $exists: false } }).text, /NOT \(EXISTS/);
  assert.match(compile(spec('StudentAccount'), { email: 'a@example.test' }).text, /DATALENGTH/);
  assert.match(compile(spec('ClubAccount'), { 'roleAssignments.role': 'supervisor' }).text, /OPENJSON/);
  assert.match(compile(spec('ClubAccount'), { assignedClubIds: 1 }).text, /TRY_CONVERT\(FLOAT/);
  assert.match(compile(spec('ClubAccount'), { roleAssignments: { $elemMatch: { role: 'software_development' } } }).text, /EXISTS/);
});
test('sparse explicit null remains distinguishable from absent keys; strings and numbers are never truncated', () => {
  const id = new mongoose.Types.ObjectId();
  const absent = stored(spec('StudentAccount'), { _id: id, email: 'a@example.test', name: 'A' });
  const explicit = stored(spec('StudentAccount'), { _id: id, email: 'a@example.test', name: 'A', googleSub: null });
  assert.equal(absent._has_googleSub, false); assert.equal(explicit._has_googleSub, true);
  assert.throws(() => stored(spec('StudentAccount'), { _id: id, email: 'x'.repeat(255) }), /no truncation/);
  assert.throws(() => stored(spec('Application'), { _id: id, id: Number.MAX_SAFE_INTEGER + 1 }), /unsafe numeric/);
  assert.throws(() => stored(spec('StudentAccount'), { _id: id, email: 'a@example.test ' }), /Trailing spaces/);
  assert.throws(() => stored(spec('Application'), { _id: id, rating: NaN }), /Non-finite/);
  assert.throws(() => stored(spec('Application'), { _id: id, answers: { removed: undefined } }), /undefined/);
});
test('Extended JSON payload round trips mixed dates/ObjectIds, Arabic text, leading zero IDs and ordered arrays', () => {
  const id = new mongoose.Types.ObjectId(), date = new Date('2026-10-14T01:02:03.456Z');
  const data = { _id: id, universityId: '00012', answers: [{ text: 'جامعة', when: date, id }, { text: 'Second' }] };
  const encoded = stored(spec('Application'), data)._payload;
  const roundtrip = mongoose.mongo.BSON.EJSON.parse(encoded);
  assert.equal(canonical(data), canonical(roundtrip));
  assert.ok(roundtrip.answers[0].when instanceof Date);
  assert.equal(roundtrip.universityId, '00012');
});
test('private device bindings stay excluded unless explicitly selected; nested projections do not leak roster fields', () => {
  const record = { _id: 'abc', email: 'x', deviceHash: 'private', name: 'A' };
  assert.equal(v.projection(record, null, spec('AttendanceRecord').model.schema).deviceHash, undefined);
  assert.equal(v.projection(record, '+deviceHash', spec('AttendanceRecord').model.schema).deviceHash, 'private');
  assert.deepEqual(v.projection({ _id: '1', memberRoster: [{ email: 'x', name: 'private' }] }, 'memberRoster.email'), { _id: '1', memberRoster: [{ email: 'x' }] });
});
test('atomic rate-limit pipeline uses each prior stage and evaluates sibling fields from one snapshot', () => {
  const now = new Date('2026-10-14T01:00:00Z');
  const operation = [{ $set: { failures: { $add: [{ $ifNull: ['$failures', 0] }, 1] } } },
    { $set: { lockedUntil: { $cond: [{ $gte: ['$failures', 5] }, now, null] } } }];
  const result = v.update({ failures: 4 }, operation);
  assert.equal(result.failures, 5); assert.equal(result.lockedUntil.getTime(), now.getTime());
  assert.deepEqual(v.update({ a: 1 }, [{ $set: { a: 2, b: '$a' } }]), { a: 2, b: 1 });
});
test('updates retain order, remove active uniqueness keys, pull matching embedded events and reject unknown operations', () => {
  const original = { activeRequesterKey: 'x', history: [1], events: [{ requestId: 1 }, { requestId: 2 }] };
  const result = v.update(original, { $unset: { activeRequesterKey: 1 }, $push: { history: 2 }, $pull: { events: { $or: [{ requestId: 1 }] } } });
  assert.deepEqual(result.history, [1, 2]); assert.deepEqual(result.events, [{ requestId: 2 }]);
  assert.equal(Object.hasOwn(result, 'activeRequesterKey'), false); assert.equal(original.activeRequesterKey, 'x');
  assert.throws(() => v.update({}, { $unknown: { x: 1 } }), /Unsupported/);
  assert.throws(() => v.update({}, { $set: { '__proto__.admin': true } }), /field path/);
});
test('report aggregation retains grouped counts and people rather than flattening relationships', () => {
  const rows = [{ clubId: 1, status: 'accepted', email: 'A@example.test', value: 4 }, { clubId: 1, status: 'accepted', email: '', value: 2 }];
  const result = v.aggregate(rows, [{ $match: { status: 'accepted' } }, { $group: { _id: '$clubId', emails: { $addToSet: '$email' }, count: { $sum: 1 }, average: { $avg: '$value' }, people: { $push: { email: '$email' } } } }]);
  assert.equal(result[0].count, 2); assert.equal(result[0].average, 3); assert.equal(result[0].people.length, 2);
  assert.throws(() => v.aggregate(rows, [{ $lookup: {} }]), /Unsupported/);
});
test('public media projection preserves index-based links and download extraction', () => {
  const { publicClubProjection } = require('../services/public-club-media');
  const row = { _id: new mongoose.Types.ObjectId(), id: 1, updatedAt: new Date(1000), events: [{ title: 'First', image: 'data:image/png;base64,AAAA' }, { title: 'Second' }] };
  const [result] = v.aggregate([row], [{ $project: publicClubProjection() }]);
  assert.equal(result.events[0].image, '/api/public-club-media/1/events/0/image?v=1000');
  assert.equal(result.events[1].title, 'Second');
});
test('backup and target path gates reject insufficient evidence and public/repository exports', () => {
  assert.throws(() => backupEvidence({}), /Verified backup/);
  assert.throws(() => backupEvidence({ backupId: 'x', sourceDatabase: 'same', restoredDatabase: 'same', isolatedRestoreVerifiedAt: new Date().toISOString() }), /distinct/);
  assert.throws(() => protectedPath(path.resolve(__dirname, '../public/private-export.json')), /outside/);
});
async function fixture(t, records) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'miu-sql-preflight-'));
  const file = path.join(dir, 'source.ndjson');
  t.after(() => { fs.unlinkSync(file); fs.rmdirSync(dir); });
  const counts = Object.fromEntries(specs.map(s => [s.name, records.filter(r => r.model === s.name).length]));
  const header = { format: 'miu-sqlserver-export-v1', backup: { backupId: 'offline-fixture', sourceDatabase: 'source', restoredDatabase: 'restored', isolatedRestoreVerifiedAt: new Date().toISOString() },
    models: specs.map(s => s.name), collectionMetadata: specs.map(s => ({ name: s.model.collection.collectionName, options: {}, indexes: s.indexes.map(i => ({ key: i.keys, ...i.options })) })) };
  fs.writeFileSync(file, [header, ...records, { end: true, counts }].map(item => mongoose.mongo.BSON.EJSON.stringify(item)).join('\n'));
  return file;
}
test('offline dry run validates unchanged records and detects duplicate accounts without SQL credentials', async t => {
  const first = new (spec('StudentAccount').model)({ email: 'a@example.test', name: 'A' }).toObject();
  let file = await fixture(t, [{ model: 'StudentAccount', document: first }]);
  assert.equal((await preflight(file)).rejected.length, 0);
  file = await fixture(t, [{ model: 'StudentAccount', document: first }, { model: 'StudentAccount', document: { ...first, _id: new mongoose.Types.ObjectId() } }]);
  const result = await preflight(file); assert.equal(result.rejected.length, 1); assert.match(result.rejected[0].reason, /Duplicate/);
});
test('offline dry run rejects missing parents and incomplete export footers; historical supervisor IDs remain intact', async t => {
  const application = new (spec('Application').model)({ id: 1, clubId: 123, email: 'a@example.test', studentName: 'A' }).toObject();
  const file = await fixture(t, [{ model: 'Application', document: application }]);
  assert.ok((await preflight(file)).rejected.some(r => /Missing referenced Club/.test(r.reason)));
  const text = fs.readFileSync(file, 'utf8').split('\n'); text.pop(); fs.writeFileSync(file, text.join('\n'));
  await assert.rejects(preflight(file), /incomplete/);
});
test('failed configuration and disconnected SQL reads never return successful empty results', async () => {
  await assert.rejects(new Query(spec('StudentAccount'), 'find', {}).lean(), /unavailable/);
  assert.equal(runtime.connection.readyState, 0);
});
test('SQL duplicate errors retain the existing API error code without copying database messages', () => {
  const s = spec('StudentAccount'), unique = s.indexes.find(i => i.options.unique);
  const error = runtime.normalizeError({ number: 2627, message: `private-value ${unique.name}` }, s);
  assert.equal(error.code, 11000); assert.deepEqual(error.keyPattern, unique.keys); assert.ok(!error.message.includes('private-value'));
});
test('failed SQL login closes its pool and never marks the application ready', async t => {
  const sql = require('mssql'), OriginalPool = sql.ConnectionPool;
  const saved = Object.fromEntries(Object.keys(env).map(k => [k, process.env[k]]));
  Object.assign(process.env, env);
  let closed = false;
  sql.ConnectionPool = class extends require('node:events').EventEmitter {
    async connect() { throw Object.assign(new Error('Injected SQL login failure.'), { code: 'ELOGIN' }); }
    async close() { closed = true; }
  };
  t.after(async () => { await runtime.disconnect(); sql.ConnectionPool = OriginalPool; for (const [k, value] of Object.entries(saved)) if (value === undefined) delete process.env[k]; else process.env[k] = value; });
  await assert.rejects(runtime.connect(), { code: 'ELOGIN' });
  assert.equal(closed, true); assert.equal(runtime.connection.readyState, 0);
});
test('SQL unit of work commits successful callbacks and rolls back failures under the transaction-owned lock', async t => {
  const sql = require('mssql');
  const originals = { ConnectionPool: sql.ConnectionPool, Transaction: sql.Transaction, Request: sql.Request };
  const saved = Object.fromEntries(Object.keys(env).map(k => [k, process.env[k]])); Object.assign(process.env, env);
  const calls = [];
  sql.ConnectionPool = class extends require('node:events').EventEmitter {
    async connect() { this.connected = true; }
    async close() { this.connected = false; }
    request() { return { query: async () => ({ recordset: [{ level: 150 }] }) }; }
  };
  sql.Transaction = class extends require('node:events').EventEmitter {
    async begin() { calls.push('begin'); }
    async commit() { calls.push('commit'); }
    async rollback() { calls.push('rollback'); this.emit('rollback'); }
  };
  sql.Request = class { async query(text) { assert.match(text, /sp_getapplock/); assert.match(text, /LockOwner='Transaction'/); calls.push('lock'); } };
  t.after(async () => { await runtime.disconnect(); Object.assign(sql, originals); for (const [k, value] of Object.entries(saved)) if (value === undefined) delete process.env[k]; else process.env[k] = value; });
  await runtime.connect({ readiness: false });
  assert.equal(await runtime.transaction(null, async () => 42), 42);
  await assert.rejects(runtime.transaction(null, async () => { throw new Error('Injected write failure.'); }), /Injected/);
  assert.deepEqual(calls, ['begin', 'lock', 'commit', 'begin', 'lock', 'rollback']);
  const reused = new runtime.Session();
  await assert.rejects(reused.withTransaction(async () => { throw new Error('Retryable workflow failure.'); }), /Retryable/);
  assert.equal(await reused.withTransaction(async () => 7), 7);
  assert.deepEqual(calls.slice(-6), ['begin', 'lock', 'rollback', 'begin', 'lock', 'commit']);
});

test('SQL session startup preserves the original lock failure when rollback also fails', async t => {
  const sql = require('mssql'), originals = { ConnectionPool: sql.ConnectionPool, Transaction: sql.Transaction, Request: sql.Request };
  const saved = Object.fromEntries(Object.keys(env).map(k => [k, process.env[k]])); Object.assign(process.env, env);
  const original = Object.assign(new Error('Injected application lock failure.'), { code: 'EREQUEST' });
  const rollback = Object.assign(new Error('Transaction already aborted.'), { name: 'TransactionError', code: 'EABORT' });
  sql.ConnectionPool = class extends require('node:events').EventEmitter { async connect() { this.connected = true; } async close() { this.connected = false; } request() { return { query: async () => ({ recordset: [{ level: 150 }] }) }; } };
  sql.Transaction = class extends require('node:events').EventEmitter { async begin() {} async rollback() { throw rollback; } };
  sql.Request = class { async query() { throw original; } };
  t.after(async () => { await runtime.disconnect(); Object.assign(sql, originals); for (const [key, value] of Object.entries(saved)) if (value === undefined) delete process.env[key]; else process.env[key] = value; });
  await runtime.connect({ readiness: false });
  const session = new runtime.Session();
  await assert.rejects(session.startTransaction(), error => error === original);
  assert.equal(original.rollbackError, rollback);
  assert.equal(session.transaction, null);
});

test('a migration connection cannot bypass later runtime readiness or missing notification triggers', async t => {
  const sql = require('mssql'), OriginalPool = sql.ConnectionPool;
  const saved = Object.fromEntries([...Object.keys(env), 'NODE_ENV'].map(key => [key, process.env[key]]));
  Object.assign(process.env, env, { NODE_ENV: 'test' });
  let validated = false, triggers = 4, closed = 0;
  sql.ConnectionPool = class extends require('node:events').EventEmitter {
    async connect() { this.connected = true; }
    async close() { this.connected = false; closed++; }
    request() { return { query: async text => ({ recordset: [text.includes('compatibility_level') ? { level: 150 }
      : text.includes('PlatformDatabaseState') ? { version: 1, validatedAt: validated ? new Date() : null }
      : { revisionRows: 1, notificationTriggers: triggers }] }) }; }
  };
  t.after(async () => {
    await runtime.disconnect(); sql.ConnectionPool = OriginalPool;
    for (const [key, value] of Object.entries(saved)) if (value === undefined) delete process.env[key]; else process.env[key] = value;
  });
  await runtime.connect({ readiness: false });
  await assert.rejects(runtime.connect(), /migration validation/);
  assert.equal(runtime.connection.readyState, 0);
  validated = true; triggers = 3;
  await runtime.connect({ readiness: false });
  await assert.rejects(runtime.connect(), /notifications are not installed/);
  assert.equal(runtime.connection.readyState, 0);
  triggers = 4;
  await runtime.connect({ readiness: false });
  await runtime.connect();
  assert.equal(runtime.connection.readyState, 1);
  assert.equal(closed, 2);
});
test('projected SQL documents retain their implicit identity and can save with optimistic version checks', async t => {
  const originalRequest = runtime.request, originalTransaction = runtime.transaction;
  const clubSpec = spec('Club');
  const data = new clubSpec.model({ id: 77, name: 'Fixture club', committee: 'IT', category: 'Test', tagline: 'Test', status: 'closed', image: '/fixture.png', description: 'Keep description', requirements: 'Keep requirements', members: 1 }).toObject();
  let writes = 0, expectedVersion;
  runtime.transaction = async (_session, callback) => callback({});
  runtime.request = () => ({ input(name, _type, value) { if (name === 'expectedVersion') expectedVersion = value; return this; }, async query(text) {
    if (text.startsWith('SELECT')) return { recordset: [{ _payload: mongoose.mongo.BSON.EJSON.stringify(data), _version: 6 }] };
    writes++; return { rowsAffected: [1] };
  } });
  t.after(() => { runtime.request = originalRequest; runtime.transaction = originalTransaction; });
  const projection = { id: 1, members: 1, memberRoster: 1 };
  const club = await new Query(clubSpec, 'findOne', { id: 77 }).select(projection);
  assert.equal(String(club._id), String(data._id));
  assert.equal(projection._id, undefined, 'Do not modify caller-owned projections');
  club.members = 0;
  await club.save();
  assert.equal(writes, 1);
  assert.equal(expectedVersion, 6);
  assert.equal(club.$locals.sqlVersion, 7);
  const excluded = await new Query(clubSpec, 'findOne', { id: 77 }).select('id members -_id');
  assert.equal(excluded._id, undefined, 'Explicit identity exclusions remain supported');
});

test('optimistic write conflicts roll back and cannot return a confirmed updated account', async t => {
  const originalRequest = runtime.request, originalTransaction = runtime.transaction;
  const statements = [], calls = [];
  const data = new (spec('StudentAccount').model)({ email: 'a@example.test', name: 'A' }).toObject();
  runtime.transaction = async (_, fn) => { try { const result = await fn({}); calls.push('commit'); return result; } catch (error) { calls.push('rollback'); throw error; } };
  runtime.request = () => ({ input() { return this; }, async query(text) {
    statements.push(text);
    if (text.startsWith('SELECT')) return { recordset: [{ _payload: mongoose.mongo.BSON.EJSON.stringify(data), _version: 3 }] };
    return { rowsAffected: [0] };
  } });
  t.after(() => { runtime.request = originalRequest; runtime.transaction = originalTransaction; });
  await assert.rejects(new Query(spec('StudentAccount'), 'findOneAndUpdate', { _id: data._id }, { $inc: { sessionVersion: 1 } }, { new: true }).lean(), { code: 'VERSION_CONFLICT' });
  assert.match(statements[0], /UPDLOCK, HOLDLOCK/); assert.match(statements[1], /\[_version\] = @expectedVersion/);
  assert.deepEqual(calls, ['rollback']);
});
test('reconciliation compares SQL BIGINT driver strings without altering leading-zero business IDs', async t => {
  const s = spec('StudentInterest');
  const data = new s.model({ studentEmail: 'a@example.test', clubId: 123, eventIndex: 0 }).toObject();
  const digest = require('node:crypto').createHash('sha256').update(canonical(data)).digest('hex');
  const row = stored(s, data); row.clubId = '123'; row.eventIndex = '0'; row._clubReference = '123';
  let batch = 0;
  const original = runtime.request;
  runtime.request = () => ({ input() { return this; }, async query(text) {
    if (text.startsWith('ALTER TABLE')) return { recordset: [] };
    if (text.includes('invalidConstraints')) return { recordset: [{ invalidConstraints: 0 }] };
    return { recordset: batch++ ? [] : [row] };
  } });
  t.after(() => { runtime.request = original; });
  const result = await verifyTarget({ specs: [s], counts: { StudentInterest: 1 }, digests: { StudentInterest: new Map([[String(data._id), digest]]) } });
  assert.equal(result.passed, true); assert.equal(result.counts.StudentInterest, 1);
});

test('reconciliation cannot pass with untrusted constraints or a failed engine validation', async t => {
  const original = runtime.request;
  t.after(() => { runtime.request = original; });
  runtime.request = () => ({ query: async () => ({ recordset: [{ invalidConstraints: 2 }] }) });
  const audit = { specs: [], counts: {}, digests: {} };
  assert.equal((await verifyTarget(audit)).passed, false);
  runtime.request = () => ({ input() { return this; }, query: async text => {
    if (text.startsWith('ALTER TABLE')) throw Object.assign(new Error('Invalid foreign key fixture.'), { number: 547 });
    return { recordset: [] };
  } });
  await assert.rejects(verifyTarget({ ...audit, specs: [spec('StudentAccount')], counts: { StudentAccount: 0 } }), { number: 547 });
});
