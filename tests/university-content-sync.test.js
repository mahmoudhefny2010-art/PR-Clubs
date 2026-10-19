const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { createUniversityPublisher, registerUniversityContentAdmin } = require('../services/university-content-admin');
const { registerMiuEventAdmin } = require('../services/miu-event-admin');
const { organization, toPublicUniversityContent, registerPublicUniversityContentDetail } = require('../services/university-content');
const P = require('../services/public-content-pagination');
const payload = { type: 'event', title: 'University welcome', description: 'Event information', date: '2030-10-20', time: '10:30', location: 'Hall A', attendanceAudience: 'all_students', imageChoice: 'logo' };
function query(fn) {
  const q = { read() { return this; }, readConcern() { return this; }, select() { return this; }, sort() { return this; },
    lean: async () => fn(), then(resolve, reject) { return Promise.resolve().then(fn).then(resolve, reject); } };
  return q;
}
function fixtureModel() {
  const rows = new Map(); let writes = 0, notifications = 0, failWrite = false, failRead = false, failNotice = false;
  const matches = (row, filter) => Object.entries(filter).every(([key, value]) => key === 'updatedAt'
    ? (row[key] ? new Date(row[key]).getTime() : null) === (value ? new Date(value).getTime() : null) : String(row[key]) === String(value));
  class Model {
    constructor(value) { Object.assign(this, value); this._id ||= Math.random().toString(16); }
    async save() {
      if (failWrite) throw new Error('WRITE_DOWN');
      if (rows.has(this._id) || [...rows.values()].some(row => row.id === this.id)) throw Object.assign(new Error('Duplicate'), { code: 11000 });
      this.createdAt = this.updatedAt = new Date(); rows.set(this._id, { ...this }); writes++;
    }
    static findById(id) { return query(() => { if (failRead) throw new Error('READ_DOWN'); return rows.get(String(id)) || null; }); }
    static findOne(filter) { return query(() => { if (failRead) throw new Error('READ_DOWN'); return [...rows.values()].find(row => matches(row, filter)) || null; }); }
    static find() { return query(() => [...rows.values()]); }
    static exists(filter) { return query(() => [...rows.values()].find(row => matches(row, filter)) || null); }
    static findOneAndUpdate(filter, patch) { return query(() => {
      if (failWrite) throw new Error('WRITE_DOWN');
      const row = [...rows.values()].find(row => matches(row, filter)); if (!row) return null;
      const saved = { ...row, ...patch.$set, updatedAt: new Date(new Date(row.updatedAt).getTime() + 1) };
      rows.set(row._id, saved); writes++; return saved;
    }); }
    static async deleteOne(filter) {
      if (failWrite) throw new Error('WRITE_DOWN');
      const row = [...rows.values()].find(row => matches(row, filter));
      if (row) rows.delete(row._id); return { deletedCount: row ? 1 : 0 };
    }
  }
  const deps = { UniversityContent: Model, databaseReady: () => true, sameOrigin: req => req.get('Origin') === 'http://localhost',
    cleanText: (value, max) => String(value || '').trim().slice(0, max),
    parseInteraction: body => ({ interaction: body.interaction || 'none', question: body.question || '', options: body.options || [] }),
    readCloudinaryAsset: async (url, publicId) => url ? { url, publicId } : null,
    cloudinaryFolders: { university: 'university' }, toApiRecord: record => ({ ...record }),
    dispatchPublishedContentNotifications: async () => { notifications++; if (failNotice) throw new Error('NOTIFICATION_DOWN'); },
    requireMiuEventsDashboard(req, res, next) { if (req.get('X-Role') !== 'miu_events') return res.sendStatus(403); req.clubAccount = { email: 'events@miuegypt.edu.eg' }; next(); },
    EventRegistration: { find: () => query(() => []) }
  };
  return { deps, rows, get writes() { return writes; }, get notifications() { return notifications; },
    failWrite(value = true) { failWrite = value; }, failRead(value = true) { failRead = value; }, failNotice() { failNotice = true; } };
}

test('one confirmed source record is reused for repeated requests without new public IDs', async () => {
  const f = fixtureModel(), publisher = createUniversityPublisher(f.deps);
  const first = await publisher.create(payload, 'events@miuegypt.edu.eg', 'request_key_12345678');
  const second = await publisher.create(payload, 'events@miuegypt.edu.eg', 'request_key_12345678');
  assert.equal(first.created, true); assert.equal(second.created, false); assert.equal(first.record.id, second.record.id);
  assert.equal(f.rows.size, 1); assert.equal(f.writes, 1);
  await assert.rejects(publisher.create({ ...payload, title: 'Another event' }, 'events@miuegypt.edu.eg', 'request_key_12345678'), { status: 409 });
  assert.equal(f.rows.size, 1);
});
test('concurrent replay requests resolve the same event; notification outages cannot undo a confirmed write', async () => {
  const f = fixtureModel(); f.failNotice(); const publisher = createUniversityPublisher(f.deps);
  const results = await Promise.all([publisher.create(payload, 'staff', 'concurrent_key_1234'), publisher.create(payload, 'staff', 'concurrent_key_1234')]);
  assert.equal(f.rows.size, 1); assert.equal(results[0].record.id, results[1].record.id);
});
test('edits preserve IDs, creation order and attribution; stale edits and type conversion are rejected', async () => {
  const f = fixtureModel(), publisher = createUniversityPublisher(f.deps);
  const { record } = await publisher.create(payload, 'staff');
  const edited = await publisher.update(record.id, { ...payload, title: 'Updated title', description: 'Updated details', date: '2030-11-01', time: '16:15', location: 'Hall B', imageChoice: 'custom', imageUrl: '/updated.png', imagePublicId: 'university/updated', updatedAt: record.updatedAt });
  assert.equal(edited.id, record.id); assert.equal(edited._id, record._id); assert.equal(edited.createdAt, record.createdAt);
  assert.equal(edited.publishedBy, 'staff'); assert.equal(edited.image, '/updated.png');
  assert.equal(f.rows.size, 1);
  const publicRecord = toPublicUniversityContent(edited);
  assert.equal(publicRecord.description, 'Updated details'); assert.equal(publicRecord.organization.id, 0);
  assert.equal(publicRecord.organization.name, 'Misr International University'); assert.equal(publicRecord.publishedBy, undefined);
  const feed = P.serialize({ clubId: 0, university: true, collection: 'events', index: edited.id, item: edited });
  assert.deepEqual(feed.item, publicRecord); assert.equal(feed.club.name, publicRecord.organization.name);
  await assert.rejects(publisher.update(record.id, { ...payload, updatedAt: record.updatedAt }), { status: 409 });
  await assert.rejects(publisher.update(record.id, { ...payload, type: 'announcement', updatedAt: edited.updatedAt }), { status: 400 });
});
test('validation and storage failures do not create feed events or send notifications', async () => {
  const f = fixtureModel(), publisher = createUniversityPublisher(f.deps);
  for (const body of [{ ...payload, date: '2030-02-30' }, { ...payload, time: '29:99' }, { ...payload, title: '' }]) await assert.rejects(publisher.create(body, 'staff'), { status: 400 });
  f.failWrite(); await assert.rejects(publisher.create(payload, 'staff'), /WRITE_DOWN/);
  assert.equal(f.rows.size, 0); assert.equal(f.notifications, 0);
});
test('older records without an updated timestamp can be edited with their existing creation revision', async () => {
  const f = fixtureModel(), publisher = createUniversityPublisher(f.deps);
  f.rows.set('legacy', { ...payload, _id: 'legacy', id: 17, createdAt: new Date('2026-10-01'), image: '/legacy.png' });
  const saved = await publisher.update(17, { ...payload, description: 'Corrected legacy details', updatedAt: '2026-10-01T00:00:00Z' });
  assert.equal(saved.id, 17); assert.equal(saved.description, 'Corrected legacy details');
});
test('protected MIU/admin APIs and public details reflect the same create/edit/delete lifecycle', async t => {
  const f = fixtureModel(), app = express(); app.use(express.json());
  registerMiuEventAdmin(app, f.deps);
  app.use('/api/admin', (req, res, next) => req.get('X-Role') === 'admin' ? next() : res.sendStatus(403));
  registerUniversityContentAdmin(app, { ...f.deps, actorEmail: () => 'admin' }, '/api/admin/university-content');
  registerPublicUniversityContentDetail(app, { ...f.deps, ensureReady: async () => {}, requireLiveDatabase: () => true });
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const request = (path, method = 'GET', body, role = 'miu_events', key) => fetch(`http://127.0.0.1:${server.address().port}${path}`, {
    method, headers: { 'Content-Type': 'application/json', Origin: 'http://localhost', 'X-Role': role, ...(key ? { 'Idempotency-Key': key } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  assert.equal((await request('/api/miu-events/content', 'POST', payload, 'student')).status, 403);
  assert.equal((await request('/api/admin/university-content', 'POST', payload, 'miu_events')).status, 403);
  let response = await request('/api/miu-events/content', 'POST', payload, 'miu_events', 'http_request_123456');
  assert.equal(response.status, 201); const created = await response.json();
  assert.deepEqual(created.organization, organization);
  response = await request('/api/miu-events/content', 'POST', payload, 'miu_events', 'http_request_123456'); assert.equal(response.status, 200);
  assert.equal(f.rows.size, 1);
  response = await request('/api/admin/university-content'); assert.equal(response.status, 403);
  response = await request('/api/admin/university-content', 'GET', undefined, 'admin'); assert.equal((await response.json())[0].id, created.id);
  response = await request(`/api/miu-events/content/${created.id}`, 'PUT', { ...payload, description: 'Latest details', updatedAt: created.updatedAt }); assert.equal(response.status, 200);
  const edited = await response.json(); assert.equal(edited.id, created.id);
  response = await request(`/api/university-content/${created.id}`, 'GET', undefined, 'student');
  const publicRecord = await response.json(); assert.equal(publicRecord.description, 'Latest details'); assert.equal(publicRecord.publishedBy, undefined);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  f.failWrite(); response = await request(`/api/miu-events/content/${created.id}`, 'PUT', { ...payload, updatedAt: edited.updatedAt }); assert.equal(response.status, 503); f.failWrite(false);
  response = await request(`/api/miu-events/content/${created.id}`, 'DELETE'); assert.equal(response.status, 204);
  assert.equal((await request(`/api/university-content/${created.id}`)).status, 404);
  assert.equal((await request('/api/miu-events/content')).status, 200); assert.equal(f.rows.size, 0);
});
