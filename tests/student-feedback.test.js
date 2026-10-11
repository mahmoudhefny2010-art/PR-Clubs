const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { parseInteraction, registerFeedbackRoutes } = require('../services/student-feedback');

test('poll definitions reject missing, repeated, excessive, or invalid options', () => {
  assert.deepEqual(parseInteraction({}), { interaction: 'none', question: '', options: [] });
  assert.equal(parseInteraction({ interaction: 'evaluation', question: 'Rate the party' }).interaction, 'evaluation');
  for (const options of [[], ['One'], ['One', 'one'], ['One', 2], Array.from({ length: 21 }, (_, i) => String(i))]) {
    assert.throws(() => parseInteraction({ interaction: 'poll', question: 'Who?', options }));
  }
  assert.throws(() => parseInteraction({ interaction: 'poll', options: ['A', 'B'] }));
  assert.deepEqual(parseInteraction({ interaction: 'poll', question: ' Who? ', options: [' A ', 'B'] }).options, ['A', 'B']);
});

test('feedback permissions, validation, privacy and response updates', async () => {
  const routes = new Map();
  const app = { get: (path, ...handlers) => routes.set(`GET ${path}`, handlers), put: (path, ...handlers) => routes.set(`PUT ${path}`, handlers) };
  const target = { _id: 'club-object', id: 1, name: 'Club' };
  const poll = { _id: 'post-object', id: 1, title: 'Welcome party', interaction: 'poll', options: ['Artist A', 'Artist B'] };
  const query = value => ({ lean: async () => value });
  const rows = [];
  const Feedback = mongoose.models.StudentFeedback;
  Feedback.init = async () => {};
  Feedback.find = ({ kind }) => ({ sort: () => query(rows.filter(row => row.kind === kind)) });
  Feedback.updateOne = async (key, update) => {
    const existing = rows.find(row => row.kind === key.kind && row.targetKey === key.targetKey && row.email === key.email);
    if (existing) Object.assign(existing, update.$set);
    else rows.push({ ...key, ...update.$set });
  };
  registerFeedbackRoutes(app, {
    Club: { find: () => query([target]), findOne: ({ id }) => query(id === 1 ? target : null) },
    UniversityContent: { find: () => query([poll]), findOne: ({ id }) => query(id === 1 ? poll : null) },
    requireStudentAuth: (req, res, next) => { if (req.role !== 'student') return res.status(401).json({}); req.studentAccount = { email: 'student@miuegypt.edu.eg' }; return next(); },
    isAdminSessionValid: async req => req.role === 'admin',
    getClubAccountFromRequest: async req => ({ role: req.role }),
    requireLiveDatabase: () => true
  });
  async function call(method, path, role, params = {}, body = {}) {
    const req = { role, params, body };
    const res = { code: 200, setHeader() {}, status(code) { this.code = code; return this; }, json(data) { this.data = data; return this; } };
    const handlers = routes.get(`${method} ${path}`);
    const run = async index => handlers[index]?.(req, res, () => run(index + 1));
    await run(0);
    return res;
  }
  for (const role of ['guest', 'student', 'president', 'head', 'english', 'security', 'sso', 'dean', 'pr', 'admin']) {
    for (const kind of ['club', 'university']) {
      const allowed = (kind === 'club' ? ['admin', 'pr', 'dean'] : ['admin', 'pr']).includes(role);
      assert.equal((await call('GET', '/api/feedback/results/:kind', role, { kind })).code, allowed ? 200 : 403, `${role}: ${kind}`);
    }
  }
  const submit = (role, kind, value, id = '1', comment = '') => call('PUT', '/api/feedback/:kind/:id', role, { kind, id }, { value, comment, email: 'forged@example.com' });
  assert.equal((await submit('guest', 'club', 5)).code, 401);
  assert.equal((await submit('pr', 'club', 5)).code, 401);
  for (const value of [0, 6, 2.5, '5', null]) assert.equal((await submit('student', 'club', value)).code, 400);
  assert.equal((await submit('student', 'club', 4, '999')).code, 404);
  assert.equal((await submit('student', 'club', 4, '1', 'x'.repeat(1001))).code, 400);
  assert.equal((await submit('student', 'university', 2)).code, 400);
  assert.equal((await submit('student', 'club', 4)).code, 200);
  assert.equal((await submit('student', 'club', 5)).code, 200);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].email, 'student@miuegypt.edu.eg');
  assert.equal(rows[0].value, 5);
  assert.equal((await submit('student', 'university', 0)).code, 200);
  assert.equal((await submit('student', 'university', 1)).code, 200);
  const results = await call('GET', '/api/feedback/results/:kind', 'pr', { kind: 'university' });
  assert.deepEqual(results.data[0].counts.map(item => item.count), [0, 1]);
  assert.ok(!JSON.stringify(results.data).includes('student@'));
  poll._id = 'replacement-post-object';
  const replaced = await call('GET', '/api/feedback/results/:kind', 'admin', { kind: 'university' });
  assert.equal(replaced.data[0].count, 0, 'Deleted post responses must not attach to reused numeric IDs');
  const index = Feedback.schema.indexes().find(([fields]) => fields.email);
  assert.equal(index[1].unique, true);
});
