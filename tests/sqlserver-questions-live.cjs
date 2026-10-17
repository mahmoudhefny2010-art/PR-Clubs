// Explicit opt-in: all mutations are limited to uniquely named synthetic fixtures.
// The fixture club is archived before commit, then read over a fresh connection.
if (!process.argv.includes('--run')) throw new Error('Use --run to verify local SQL question persistence.');
require('dotenv').config({ quiet: true });
process.env.SQLSERVER_CONNECTION_TIMEOUT_MS = '30000';
const assert = require('node:assert/strict');
const db = require('../database');
const { Club, ClubAccount, Application } = require('../models');
const { registerClubQuestions } = require('../services/club-questions');
const id = Date.now(), email = `question-fixture-${id}@example.test`;
const question = { key: 'fixture_q', label: 'Original question', type: 'text', required: true, options: [] };
let session, committed = false;
const fixtureName = `QUESTION PERSISTENCE FIXTURE ${id}`;
async function main() {
  assert.equal(db.isSqlProvider, true);
  await db.connect();
  session = await db.startSession();
  try {
    await session.withTransaction(async () => {
      await Club.create([{ id, name: fixtureName, committee: 'IT', category: 'Test', tagline: 'Test', image: '/fixture.png', description: 'Test', requirements: 'Test', status: 'open', applicationFields: [question] }], { session });
      await ClubAccount.create([{ clubId: id, email, role: 'vice_president', salt: 'fixture-unusable-salt', passwordHash: 'fixture-unusable-password', roleAssignments: [{ role: 'vice_president', clubId: id }, { role: 'head', clubId: id, committee: 'IT' }] }], { session });
      const answers = [{ key: question.key, label: question.label, value: 'Original saved answer' }];
      await Application.create([{ id, clubId: id, studentName: 'Question fixture', email, status: 'pending', answers,
        interviewEvaluations: [{ scope: 'IT', answers }] }], { session });
      const scoped = model => new Proxy(model, { get(target, key) {
        if (!['find', 'findOne', 'findOneAndUpdate'].includes(key)) return Reflect.get(target, key);
        return (...args) => target[key](...args).session(session);
      } });
      const routes = new Map();
      registerClubQuestions({ get: (path, ...handlers) => routes.set('GET ' + path, handlers), put: (path, ...handlers) => routes.set('PUT ' + path, handlers) }, {
        Club: scoped(Club), ClubAccount: scoped(ClubAccount), clubs: [], requireLiveDatabase: () => true,
        requireClubAuth: (_req, _res, next) => next(), getInterviewFormScope: () => '__president__',
        getInterviewFormSections: (forms, scope) => forms.find(form => form.scope === scope)?.sections || []
      });
      async function call(method, kind, body = {}) {
        const handlers = routes.get(`${method} /api/club/${kind}-form`);
        const req = { body, query: method === 'GET' ? body : {}, clubAccount: { role: 'vice_president', clubId: id } };
        const res = { code: 200, setHeader() {}, status(code) { this.code = code; return this; }, json(body) { this.body = body; } };
        let index = 0;
        await (async function next() { if (handlers[index]) await handlers[index++](req, res, next); })();
        assert.equal(res.code, 200, JSON.stringify(res.body));
        return res.body;
      }
      await call('PUT', 'application', { applicationIntro: 'Fixture intro', applicationFields: [{ ...question, label: 'Edited question' }] });
      await call('PUT', 'application', { committee: 'IT', applicationFields: [{ ...question, key: 'committee_q', label: 'IT question' }] });
      await call('PUT', 'interview', { committee: 'IT', sections: [{ key: 'skills', title: 'Skills', questions: [question] }] });
      await call('PUT', 'interview', { committee: 'IT', sections: [] });
      assert.equal((await call('GET', 'application', { committee: 'IT' })).applicationFields[0].key, 'committee_q');
      const historical = await Application.findOne({ id, clubId: id }).session(session).lean();
      assert.deepEqual(historical.answers, answers);
      assert.deepEqual(historical.interviewEvaluations[0].answers, answers);
      await Club.updateOne({ id, name: fixtureName }, { $set: { archivedAt: new Date() } }, { session });
    });
    committed = true;
    await session.endSession(); session = null;
    await db.disconnect(); await db.connect();
    const persisted = await Club.findOne({ id, name: fixtureName }).lean();
    assert.equal(persisted.applicationFields.length, 2);
    assert.equal(persisted.applicationFields[0].label, 'Edited question');
    assert.equal(persisted.applicationFields[1].committee, 'IT');
    assert.deepEqual(persisted.interviewForms[0].sections, []);
    assert.equal(persisted.questionHistory.length, 4);
    assert.equal((await ClubAccount.findOne({ email }).lean()).role, 'vice_president');
    assert.equal((await Application.findOne({ id, clubId: id }).lean()).answers[0].label, 'Original question');
    console.log('PASS: real SQL API add/edit/remove, committee scope, saved question history, historical answers, Vice President role, and persistence over a fresh connection.');
  } finally {
    if (session) await session.endSession();
    if (committed) {
      await Application.deleteMany({ id, clubId: id, email });
      await ClubAccount.deleteMany({ clubId: id, email });
      await Club.deleteOne({ id, name: fixtureName });
      assert.equal(await Club.countDocuments({ id }), 0);
      assert.equal(await Application.countDocuments({ id }), 0);
      assert.equal(await ClubAccount.countDocuments({ email }), 0);
      console.log('PASS: all synthetic fixtures removed.');
    }
    await db.disconnect();
  }
}
main().catch(error => { console.error(error.code || error.name, String(error.message || 'Live SQL check failed.').slice(0, 400)); process.exitCode = 1; });
