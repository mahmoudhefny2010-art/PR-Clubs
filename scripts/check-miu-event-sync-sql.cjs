// End-to-end service/SQL check. Every fixture is inside one rollback transaction.
require('dotenv').config();
process.env.SQLSERVER_CONNECTION_TIMEOUT_MS = '30000';
if (process.argv.includes('--diagnose')) process.env.SQLSERVER_REQUEST_TIMEOUT_MS = '60000';
const assert = require('node:assert/strict');
const db = require('../database');
const runtime = require('../database/runtime');
const { Club, UniversityContent, EventRegistration } = require('../models');
const { parseInteraction } = require('../services/student-feedback');
const { createUniversityPublisher } = require('../services/university-content-admin');
const { toPublicUniversityContent } = require('../services/university-content');
const { options } = require('../services/public-content-pagination');
const { readPublicContentPage } = require('../database/public-content-pagination');
async function main() {
  require('./sqlserver-migrate.cjs').targetGate(); assert.ok(db.isSqlProvider);
  const rollback = new Error('QA_ROLLBACK'), token = `miusync_qa_${Date.now()}`, clubId = Date.now();
  const actor = 'miusync-rollback-only@miuegypt.edu.eg';
  await runtime.connect();
  console.log('Connected to SQL Server.');
  try {
    await runtime.transaction(null, async () => {
      console.log('Rollback-only transaction started.');
      const publisher = createUniversityPublisher({ UniversityContent, cleanText: (value, max) => String(value || '').trim().slice(0, max), parseInteraction,
        readCloudinaryAsset: async (url, publicId) => ({ url, publicId }), cloudinaryFolders: { university: 'university' }, dispatchPublishedContentNotifications: async () => {} });
      const body = { type: 'event', title: `${token} University event`, description: 'Original description', date: '2030-10-20', time: '10:30', location: 'Hall A',
        registrationEnabled: true, attendanceEnabled: true, attendanceAudience: 'all_students', imageChoice: 'logo' };
      const first = await publisher.create(body, actor, token + '_publish');
      console.log('MIU publication confirmed.');
      assert.equal(first.created, true);
      const repeated = await publisher.create(body, actor, token + '_publish');
      console.log('Idempotent replay confirmed.');
      assert.equal(repeated.created, false); assert.equal(first.record.id, repeated.record.id);
      for (let i = 0; i < 12; i++) await publisher.create({ ...body, title: `${token} Extra ${i}`, date: '2030-10-21' }, actor, token + '_extra_' + i);
      console.log('Multi-page university fixtures created.');
      await publisher.create({ ...body, type: 'announcement', title: `${token} Notice` }, actor, token + '_notice');
      console.log('University announcement created.');
      await Club.create({ id: clubId, name: token, committee: 'QA', category: 'QA', tagline: 'QA', description: 'QA', requirements: 'QA', image: '/qa.png',
        events: [{ title: `${token} Club event`, date: '2030-10-19', description: 'Club content is preserved', createdAt: new Date() }],
        posts: [{ title: `${token} Club update`, text: 'Club content is preserved', createdAt: new Date() }] });
      console.log('Club content fixture created.');
      await EventRegistration.create({ id: first.record.id + 1, clubId: 0, eventIndex: first.record.id, eventRequestId: first.record.id,
        registrationKey: `${token}:student`, eventTitle: first.record.title, name: 'Rollback Student', email: 'rollback-student@example.test' });
      console.log('Registration fixture created.');
      const read = (section, extra = {}) => readPublicContentPage(options(section, { q: token, pageSize: 10, ...extra }));
      const timeline = await read('events');
      console.log('Timeline page read.');
      assert.equal(timeline.pagination.totalItems, 14); assert.equal(timeline.pagination.totalPages, 2);
      assert.equal(timeline.items.filter(row => row.item.id === first.record.id).length, 1);
      assert.ok(timeline.items.some(row => !row.university));
      const feed = await read('feed'); assert.equal(feed.pagination.totalItems, 16);
      console.log('Combined timeline and feed include university and club records.');
      assert.ok(feed.items.some(row => row.university));
      assert.ok(feed.items.filter(row => row.university).every(row => row.item.createdAt instanceof Date));
      assert.equal((await read('updates')).pagination.totalItems, 2, 'Extended JSON announcement dates must not disappear from updates');
      const last = await read('feed', { page: 2 }); assert.equal(last.items.length, 6);
      assert.equal((await read('feed', { filter: 'events' })).pagination.totalItems, 14);
      assert.equal((await read('feed', { filter: 'announcements' })).pagination.totalItems, 1);
      const edited = await publisher.update(first.record.id, { ...body, title: `${token} Edited University event`, description: 'Updated description',
        date: '2030-11-01', time: '16:15', location: 'Hall B', imageChoice: 'custom', imageUrl: '/qa-updated-image.png', imagePublicId: 'university/qa-rollback', updatedAt: first.record.updatedAt });
      assert.equal(edited.id, first.record.id); assert.equal(String(edited._id), String(first.record._id));
      await assert.rejects(publisher.update(first.record.id, { ...body, updatedAt: first.record.updatedAt }), { status: 409 });
      const targetPage = await read('events', { post: first.record.id });
      const target = targetPage.items.find(row => row.item.id === first.record.id); assert.ok(target);
      const detail = toPublicUniversityContent(await UniversityContent.findOne({ id: first.record.id }).lean());
      assert.deepEqual(JSON.parse(JSON.stringify(target.item)), JSON.parse(JSON.stringify(detail))); assert.equal(target.club.name, 'Misr International University');
      assert.equal(detail.description, 'Updated description'); assert.equal(detail.date, '2030-11-01');
      assert.equal(detail.time, '16:15'); assert.equal(detail.location, 'Hall B'); assert.equal(detail.image, '/qa-updated-image.png');
      assert.equal(detail.publishedBy, undefined); assert.equal(detail.organization.id, 0);
      const registration = await EventRegistration.findOne({ registrationKey: `${token}:student` }).lean();
      assert.equal(registration.eventRequestId, first.record.id); assert.equal(registration.eventTitle, first.record.title);
      await UniversityContent.deleteOne({ id: first.record.id });
      assert.equal((await read('feed')).pagination.totalItems, 15); assert.equal((await read('events')).pagination.totalItems, 13);
      assert.equal(await UniversityContent.findOne({ id: first.record.id }).lean(), null);
      assert.equal(await UniversityContent.countDocuments({ publishedBy: actor }), 13);
      console.log('PASS: SQL publish, idempotent retry, MIU listing, combined feed/timeline counts, filters, multiple pages, stable identity, in-place edits, media, details, stale-edit rejection, preserved registrations and deletion.');
      throw rollback;
    });
  } catch (error) { if (error !== rollback) throw error; }
  finally { await runtime.disconnect(); }
  console.log('All MIU sync fixtures rolled back; no notifications sent.');
}
main().catch(error => { console.error(error.name + ': ' + error.message); process.exitCode = 1; });
