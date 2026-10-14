const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { registerMiuEventAdmin } = require('../services/miu-event-admin');

function query(value) {
  return { read() { return this; }, readConcern() { return this; }, sort() { return this; }, select() { return this; }, lean: async () => value };
}

async function fixture(t, options = {}) {
  let saved;
  const app = express(); app.use(express.json());
  registerMiuEventAdmin(app, {
    UniversityContent: {
      find: () => query(saved ? [saved] : []),
      findOne: () => query(null),
      findById: () => query(saved),
      deleteOne: async () => ({ deletedCount: 0 }),
      exists: () => ({ read() { return this; }, readConcern() { return this; }, then(resolve) { resolve(null); } }),
      ...options.model
    },
    databaseReady: () => options.databaseReady !== false,
    sameOrigin: req => req.headers.origin === 'http://127.0.0.1',
    cleanText: (value, max) => String(value || '').trim().slice(0, max),
    parseInteraction: body => ({ interaction: body.interaction || 'none', question: '', options: [] }),
    readCloudinaryAsset: async () => null,
    cloudinary: { uploader: { destroy: async () => ({}) } }, cloudinaryFolders: { university: 'university' }, cloudinaryConfigured: false,
    dispatchPublishedContentNotifications: async () => {}, toApiRecord: item => item,
    requireMiuEventsDashboard(req, res, next) { if (req.headers['x-role'] === 'miu_events') { req.clubAccount = { email: 'events@miuegypt.edu.eg' }; return next(); } return res.status(403).json({ message: 'MIU role required.' }); }
  });
  const server = await new Promise(resolve => { const current = app.listen(0, '127.0.0.1', () => resolve(current)); });
  t.after(() => new Promise(resolve => server.close(resolve)));
  const request = (path, role = '', body) => fetch(`http://127.0.0.1:${server.address().port}${path}`, {
    method: body ? 'POST' : 'GET', headers: { ...(role ? { 'x-role': role } : {}), ...(body ? { origin: 'http://127.0.0.1', 'content-type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  return { request, setSaved(value) { saved = value; } };
}

test('MIU events content API is isolated to the assigned role and handles database outages', async t => {
  const { request } = await fixture(t, { databaseReady: false });
  assert.equal((await request('/api/miu-events/content')).status, 403);
  assert.equal((await request('/api/miu-events/content', 'miu_events')).status, 503);
});

test('MIU Events event publishing requires an explicit audience before writing', async t => {
  let persisted;
  const { request } = await fixture(t, { model: {
    findOne: () => ({ read() { return this; }, readConcern() { return this; }, sort() { return this; }, select() { return this; }, lean: async () => null }),
    findById: () => ({ read() { return this; }, readConcern() { return this; }, lean: async () => persisted }),
  } });
  // Exercise route authorization and request validation even when the test model cannot confirm a write.
  const invalid = await request('/api/miu-events/content', 'miu_events', { type: 'event', title: 'University Day', description: 'Details', registrationEnabled: true });
  assert.equal(invalid.status, 400);
  assert.match((await invalid.json()).message, /Choose who can register/);
  assert.equal(persisted, undefined);
});
