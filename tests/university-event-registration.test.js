const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const vm = require('node:vm');
const fs = require('node:fs');
const crypto = require('node:crypto');

async function fixture(t, options = {}) {
  const registrations = [];
  const event = { id: 10, type: 'event', title: 'MIU event', date: '2099-10-15', registrationEnabled: true, attendanceAudience: 'members', ...options.event };
  const query = value => ({ select() { return this; }, read() { return this; }, readConcern() { return this; }, lean: async () => value });
  const app = express(); app.use(express.json());
  const records = {
    UniversityContent: { findOne: () => query(options.dbFailure ? null : event) },
    Club: { find: filter => query((options.members || []).includes(filter['memberRoster.email']) ? [{ id: 1 }] : []) },
    Application: { find: filter => query((options.accepted || []).includes(filter.email) ? [{ clubId: 2 }] : []) },
    EventRegistration: {
      findOne: filter => query(registrations.find(record => record.email === filter.email) || null),
      countDocuments: async () => registrations.length,
      create: async value => { const record = { ...value, _id: String(registrations.length + 1) }; registrations.push(record); return record; },
      findById: id => query(registrations.find(record => record._id === id) || null)
    }
  };
  const context = {
    app, ...records, crypto,
    cleanText: (value, max) => String(value || '').trim().slice(0, max),
    requireLiveDatabase(res) { if (!options.databaseDown) return true; res.status(503).json({ message: 'Database unavailable.' }); return false; },
    isSameOriginRequest: () => true,
    requireStudentAuth(req, res, next) {
      const user = req.headers['x-student'];
      if (!user || user === 'none') return res.status(401).json({ message: 'Sign in with your MIU student account.' });
      req.studentAccount = { _id: user, name: `Account ${user}`, email: `${user}@miuegypt.edu.eg` };
      return next();
    },
    console,
    require: name => name === './services/student-event-registration' ? require('../services/student-event-registration') : require(name)
  };
  vm.createContext(context);
  const source = fs.readFileSync(require.resolve('../server'), 'utf8');
  const start = source.indexOf('async function requireMiuMemberRegistrationAuth');
  const end = source.indexOf('// Attendance sessions are backed by MongoDB.', start);
  assert.ok(start >= 0 && end > start);
  vm.runInContext(source.slice(start, end), context);
  const server = await new Promise(resolve => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); });
  t.after(() => new Promise(resolve => server.close(resolve)));
  async function request(method, user, body = {}) {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/university-content/10/registrations`, {
      method, headers: { 'Content-Type': 'application/json', ...(user ? { 'x-student': user } : {}) },
      ...(method === 'GET' ? {} : { body: JSON.stringify(body) })
    });
    return { status: response.status, data: await response.json() };
  }
  return { request, registrations };
}

test('member-only MIU registration requires login, checks membership and saves verified account identity', async t => {
  const f = await fixture(t, { members: ['member@miuegypt.edu.eg'] });
  assert.equal((await f.request('GET', null)).status, 401);
  assert.equal((await f.request('GET', 'outsider')).data.eligible, false);
  assert.equal((await f.request('POST', 'outsider', { name: 'Forged', email: 'member@miuegypt.edu.eg' })).status, 403);
  assert.equal((await f.request('POST', 'member', { name: 'Forged', email: 'victim@miuegypt.edu.eg' })).status, 201);
  assert.equal(f.registrations[0].name, 'Account member');
  assert.equal(f.registrations[0].email, 'member@miuegypt.edu.eg');
  assert.equal((await f.request('GET', 'member')).data.registered, true);
});

test('all-student MIU registration preserves the public form; database failure stays visible', async t => {
  const f = await fixture(t, { event: { attendanceAudience: 'all_students' } });
  assert.equal((await f.request('POST', null, { name: 'Guest', email: 'guest@example.edu' })).status, 201);
  assert.equal(f.registrations[0].email, 'guest@example.edu');
  const down = await fixture(t, { databaseDown: true });
  assert.equal((await down.request('POST', null, { name: 'Guest', email: 'guest@example.edu' })).status, 503);
});
