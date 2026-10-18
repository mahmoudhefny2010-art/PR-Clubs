const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { notificationSchemaSql, readPublicRevision, changedPublicKeys } = require('../database/public-revisions');
const { serveSqlPublicDataStream } = require('../services/sql-public-data-stream');
const revision = { epoch: '12345678-1234-1234-1234-123456789012', clubs: '9007199254740993', universityContent: '1' };

test('SQL and Azure notification DDL tracks bulk writes and deletions inside the writing transaction', () => {
  const sql = notificationSchemaSql();
  assert.match(sql, /PlatformPublicRevision/);
  for (const name of ['Club', 'Application', 'UniversityContent', 'StudentFeedback']) {
    assert.match(sql, new RegExp('TR_' + name + '_PublicRevision'));
  }
  assert.equal((sql.match(/AFTER INSERT, UPDATE, DELETE/g) || []).length, 8);
  assert.match(sql, /SET NOCOUNT ON/);
  assert.match(sql, /NOT EXISTS \(SELECT 1 FROM inserted\) AND NOT EXISTS \(SELECT 1 FROM deleted\)/);
  assert.doesNotMatch(sql, /\bDROP\b|\bTRUNCATE\b|DELETE FROM|ServiceBroker|CHANGE_TRACKING/i);
  assert.equal(fs.readFileSync('database/migrations/002-public-live.sql', 'utf8').replace(/\r\n/g, '\n'), require('../scripts/sqlserver-live-schema.cjs').sql.replace(/\r\n/g, '\n'));
});

test('revision comparisons retain full BIGINT precision and detect SQL target changes', async () => {
  const loaded = await readPublicRevision({ request: () => ({ query: async () => ({ recordset: [revision] }) }) });
  assert.equal(loaded.clubs, '9007199254740993');
  assert.deepEqual(changedPublicKeys(revision, { ...revision, clubs: '9007199254740994' }), ['clubs']);
  assert.deepEqual(changedPublicKeys(revision, revision), []);
  assert.deepEqual(changedPublicKeys(revision, { ...revision, epoch: '87654321-1234-1234-1234-123456789012' }), ['clubs', 'universityContent']);
  await assert.rejects(readPublicRevision({ request: () => ({ query: async () => ({ recordset: [] }) }) }), /unavailable/);
});

async function session({ token, rows = [revision], fail = false } = {}) {
  let reads = 0, end;
  const finished = new Promise(resolve => { end = resolve; });
  const output = [];
  const runtime = { request: () => ({ query: async text => {
    assert.match(text, /PlatformPublicRevision/);
    assert.doesNotMatch(text, /_payload|FROM \[dbo\]\.\[Club\]/);
    if (fail) throw new Error('missing schema');
    return { recordset: [rows[Math.min(reads++, rows.length - 1)]] };
  } }) };
  const res = {
    code: 200, status(code) { this.code = code; return this; }, json() { end(); },
    on() {}, setHeader() {}, flushHeaders() {}, write(text) { output.push(text); }, end
  };
  await serveSqlPublicDataStream({ get: () => token, query: {} }, res, { runtime, duration: 25, checkInterval: 2 });
  await finished;
  return { output: output.join(''), reads, code: res.code };
}
const tokenFor = value => 'sql:' + Buffer.from(JSON.stringify(value)).toString('base64url');

test('SQL SSE resumes unchanged cached data without requesting full lists', async () => {
  const result = await session({ token: tokenFor(revision) });
  assert.match(result.output, /event: ready/);
  assert.doesNotMatch(result.output, /event: invalidate/);
  assert.ok(result.reads >= 1);
});

test('SQL SSE sends only changed dataset names and resets foreign Mongo tokens once', async () => {
  const result = await session({ token: tokenFor(revision), rows: [revision, { ...revision, clubs: '9007199254740994' }] });
  assert.match(result.output, /event: invalidate\ndata: \{"keys":\["clubs"\]\}/);
  assert.equal((result.output.match(/event: invalidate/g) || []).length, 1);
  const fresh = await session({ token: 'mongo-resume-token' });
  assert.match(fresh.output, /"keys":\["clubs","universityContent"\]/);
  assert.equal((fresh.output.match(/event: invalidate/g) || []).length, 1);
});

test('missing SQL notification schema fails before starting an apparently successful stream', async () => {
  const result = await session({ fail: true });
  assert.equal(result.code, 503);
  assert.equal(result.output, '');
});
