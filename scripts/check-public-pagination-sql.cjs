// Integration QA: synthetic records are always rolled back, including on failure.
require('dotenv').config();
process.env.SQLSERVER_CONNECTION_TIMEOUT_MS = '30000';
if (process.argv.includes('--diagnose')) process.env.SQLSERVER_REQUEST_TIMEOUT_MS = '60000';
const assert = require('node:assert/strict');
const db = require('../database');
const runtime = require('../database/runtime');
const { Club, UniversityContent } = require('../models');
const { options } = require('../services/public-content-pagination');
const { readPublicContentPage } = require('../database/public-content-pagination');
async function main() {
  require('./sqlserver-migrate.cjs').targetGate();
  assert.ok(db.isSqlProvider);
  const rollback = new Error('QA_ROLLBACK');
  const token = `pagination_qa_${Date.now()}`, id = Date.now();
  await runtime.connect();
  console.log('Connected to SQL Server.');
  const volume = (await runtime.request().query('SELECT COUNT(*) AS clubs, SUM(CAST(DATALENGTH(_payload) AS BIGINT))/1048576 AS payloadMB FROM dbo.Club;')).recordset[0];
  console.log('Existing source volume: ' + volume.clubs + ' clubs, ' + volume.payloadMB + ' MB.');
  try {
    await runtime.transaction(null, async () => {
      console.log('Rollback transaction started.');
      const entries = Array.from({ length: 25 }, (_, i) => ({ title: `${token} item ${i}`, text: 'Published update',
        date: `2030-10-${String(i + 1).padStart(2, '0')}`, createdAt: '2026-10-18T10:00:00Z', requestId: i + 1,
        image: 'data:image/png;base64,YQ==', privateSecret: 'must-not-leak' }));
      await Club.create({ id, name: token, category: 'QA', tagline: 'QA', description: 'QA', status: 'open', committee: 'QA', image: '/qa.png', requirements: 'QA',
        events: entries, posts: entries, sponsors: entries, booths: entries });
      console.log('Synthetic club created.');
      await UniversityContent.create({ id: id + 1, title: `${token} university`, type: 'event', description: 'QA', date: '2030-10-26', createdAt: new Date() });
      console.log('Synthetic university event created.');
      const probe = await readPublicContentPage(options('feed', { clubId: id }));
      assert.equal(probe.pagination.totalItems, 50);
      console.log('Scoped club page passed.');
      const read = (section, extra = {}) => readPublicContentPage(options(section, { q: token, ...extra }));
      for (const section of ['feed', 'events', 'sponsors', 'booths', 'updates']) {
        console.log('Checking ' + section);
        const started = Date.now();
        let result = await read(section, { pageSize: 10 });
        const count = section === 'feed' ? 51 : section === 'events' ? 26 : 25;
        assert.equal(result.pagination.totalItems, count, section);
        assert.equal(result.items.length, 10);
        const firstKeys = new Set(result.items.map(row => `${row.university}:${row.collection}:${row.index}`));
        const second = await read(section, { page: 2, pageSize: 10 });
        assert.equal(second.pagination.page, 2);
        assert.ok(second.items.every(row => !firstKeys.has(`${row.university}:${row.collection}:${row.index}`)));
        result = await read(section, { page: 999, pageSize: 10 });
        assert.equal(result.pagination.page, Math.ceil(count / 10));
        assert.equal(result.items.length, count % 10 || 10);
        assert.ok(result.items.every(row => !JSON.stringify(row).includes('must-not-leak')));
        console.log(section + ' checks completed in ' + (Date.now() - started) + 'ms.');
      }
      assert.equal((await read('feed', { filter: 'events' })).pagination.totalItems, 26);
      assert.equal((await read('feed', { filter: 'activities' })).pagination.totalItems, 25);
      assert.equal((await read('feed', { filter: 'announcements' })).pagination.totalItems, 0);
      const target = await read('events', { pageSize: 10, post: id + 1 });
      assert.equal(target.pagination.page, 1);
      assert.ok(target.items.some(row => row.university && row.item.id === id + 1));
      assert.equal((await read('events')).items[0].item.id, id + 1, 'Newest publication precedes events with earlier scheduled dates');
      assert.ok((await read('events', { clubId: id })).items[0].item.image.includes(`/${id}/events/0/image?v=`));
      await Club.updateOne({ id }, { $set: { sponsors: entries.concat(entries.slice(0, 6)) } });
      assert.equal((await read('sponsors', { pageSize: 10 })).pagination.totalPages, 4);
      await Club.updateOne({ id }, { $set: { sponsors: entries.slice(0, 7) } });
      const shrunk = await read('sponsors', { pageSize: 10, page: 4 });
      assert.deepEqual(shrunk.pagination, { page: 1, pageSize: 10, totalItems: 7, totalPages: 1 });
      await Club.updateOne({ id }, { $set: { archivedAt: new Date() } });
      assert.equal((await read('booths')).pagination.totalItems, 0);
      assert.equal((await read('events')).pagination.totalItems, 1);
      console.log('PASS: SQL counts, page boundaries, stable ordering, filtering, search, deep links, media, growth, deletion and archived-club exclusion.');
      throw rollback;
    });
  } catch (error) { if (error !== rollback) throw error; }
  finally { await runtime.disconnect(); }
  console.log('All synthetic pagination records rolled back.');
}
main().catch(error => { console.error(error.name + ': ' + error.message); process.exitCode = 1; });
