const test = require('node:test');
const assert = require('node:assert/strict');
const { registerClubQuestions, applicationQuestions, validateQuestions, validateSections, validateAnswers } = require('../services/club-questions');
const q = (key = 'why', label = 'Why join?') => ({ key, label, type: 'text', required: true, options: [] });
function harness() {
  const records = [{ id: 1, updatedAt: new Date(1), applicationFields: [q()], interviewForms: [] }, { id: 2, updatedAt: new Date(1), applicationFields: [q('other')], interviewForms: [] }];
  const cache = structuredClone(records), routes = new Map();
  let fail = false;
  const chain = value => ({ select() { return this; }, lean: async () => { if (fail) throw new Error('SQL unavailable'); return structuredClone(value); } });
  const deps = {
    Club: {
      findOne: filter => chain(records.find(c => c.id === filter.id)),
      findOneAndUpdate(filter, { $set }) {
        const club = records.find(c => c.id === filter.id && Number(c.updatedAt) === Number(filter.updatedAt));
        if (club && !fail) Object.assign(club, structuredClone($set), { updatedAt: new Date(Number(club.updatedAt) + 1) });
        return chain(club);
      }
    },
    ClubAccount: { find: () => chain([{ clubId: 1, role: 'head', committee: 'IT' }, { clubId: 1, role: 'head', committee: 'PR' }]) },
    requireClubAuth(req, res, next) { return req.clubAccount ? next() : res.status(401).json({ message: 'Sign in' }); },
    requireLiveDatabase: () => true, clubs: cache,
    getInterviewFormScope: account => account.role === 'head' ? account.committee : '__president__',
    getInterviewFormSections: (forms, scope) => (forms.find(f => f.scope === scope) || forms.find(f => f.scope === '__president__'))?.sections || []
  };
  function reload() { registerClubQuestions({ get: (p, ...h) => routes.set('GET ' + p, h), put: (p, ...h) => routes.set('PUT ' + p, h) }, deps); }
  reload();
  return { records, cache, reload, fail() { fail = true; }, async call(method, kind, body = {}, role = 'president', committee = '', clubId = 1) {
    const req = { body, query: method === 'GET' ? body : {}, params: { id: clubId }, clubAccount: role ? { role, clubId, committee } : null };
    const res = { code: 200, setHeader() {}, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
    const path = kind === 'public' ? '/api/clubs/:id/application-form' : `/api/club/${kind}-form`;
    const handlers = routes.get(method + ' ' + path);
    let index = 0;
    await (async function next() { if (handlers[index]) await handlers[index++](req, res, next); })();
    return res;
  } };
}

test('president CRUD persists across handler reloads, keeps question ids and config history, and leaves other clubs intact', async () => {
  const h = harness(), other = structuredClone(h.records[1]);
  assert.equal((await h.call('PUT', 'application', { applicationIntro: 'Welcome', applicationFields: [q(), q('new')] })).code, 200);
  h.reload();
  let loaded = await h.call('GET', 'application');
  assert.equal(loaded.body.applicationFields.length, 2);
  assert.equal((await h.call('PUT', 'application', { applicationIntro: 'Welcome', applicationFields: [q('why', 'Updated text')], version: loaded.body.version.toISOString() })).code, 200);
  loaded = await h.call('GET', 'public', {}, null);
  assert.equal(loaded.body.applicationFields.length, 1);
  assert.equal(loaded.body.applicationFields[0].key, 'why');
  assert.equal(loaded.body.applicationFields[0].label, 'Updated text');
  assert.equal(h.records[0].questionHistory[1].applicationFields.length, 2);
  assert.deepEqual(h.records[1], other);
});

test('head edits only own committee and public questions combine whole-club and selected committee', async () => {
  const h = harness();
  assert.equal((await h.call('PUT', 'application', { applicationFields: [q('it')], applicationIntro: 'Cannot overwrite global intro' }, 'head', 'IT')).code, 200);
  assert.equal((await h.call('PUT', 'application', { applicationFields: [q('pr')] }, 'head', 'PR')).code, 200);
  const club = h.records[0];
  assert.deepEqual(applicationQuestions(club, 'IT').map(q => q.key), ['why', 'it']);
  assert.deepEqual(applicationQuestions(club, 'PR').map(q => q.key), ['why', 'pr']);
  assert.equal(club.applicationIntro, undefined);
  assert.equal((await h.call('PUT', 'application', { committee: 'PR', applicationFields: [] }, 'head', 'IT')).code, 403);
  assert.equal((await h.call('PUT', 'application', { committee: '', applicationFields: [] }, 'head', 'IT')).code, 403);
});

test('vice president manages club and committee questions with no cross-club access', async () => {
  const h = harness();
  assert.equal((await h.call('PUT', 'application', { applicationIntro: '', applicationFields: [q('vp')] }, 'vice_president')).code, 200);
  assert.equal((await h.call('PUT', 'interview', { committee: 'IT', sections: [{ key: 's', title: 'Skills', questions: [q('skill')] }] }, 'vice_president')).code, 200);
  assert.equal((await h.call('PUT', 'application', { clubId: 2, applicationFields: [] }, 'vice_president')).code, 403);
});

test('interview add, edit and remove preserve earlier versions and isolate committees', async () => {
  const h = harness();
  const sections = [{ key: 'skills', title: 'Skills', questions: [q('technical')] }];
  assert.equal((await h.call('PUT', 'interview', { sections }, 'head', 'IT')).code, 200);
  sections[0].questions[0].label = 'Updated skill question';
  assert.equal((await h.call('PUT', 'interview', { sections }, 'head', 'IT')).code, 200);
  h.reload();
  assert.equal((await h.call('GET', 'interview', {}, 'head', 'IT')).body.sections[0].questions[0].label, 'Updated skill question');
  assert.deepEqual((await h.call('GET', 'interview', {}, 'head', 'PR')).body.sections, []);
  assert.equal((await h.call('PUT', 'interview', { sections: [] }, 'head', 'IT')).code, 200);
  assert.deepEqual((await h.call('GET', 'interview', {}, 'head', 'IT')).body.sections, []);
  assert.equal(h.records[0].questionHistory[2].interviewForms[0].sections[0].questions[0].label, 'Updated skill question');
});

test('every manager endpoint rejects anonymous and unrelated roles, and forged ownership', async () => {
  const h = harness();
  for (const kind of ['application', 'interview']) for (const method of ['GET', 'PUT']) {
    assert.equal((await h.call(method, kind, {}, null)).code, 401);
    for (const role of ['student', 'pr', 'supervisor', 'security']) assert.equal((await h.call(method, kind, {}, role)).code, 403);
    assert.equal((await h.call(method, kind, { clubId: 2 })).code, 403);
    assert.equal((await h.call(method, kind, {}, 'head', '')).code, 403);
  }
});

test('rejects stale editor versions and database failures without changing cache', async () => {
  const h = harness();
  assert.equal((await h.call('PUT', 'application', { version: 'outdated', applicationFields: [] })).code, 409);
  const before = structuredClone(h.cache);
  h.fail();
  assert.equal((await h.call('PUT', 'application', { applicationIntro: '', applicationFields: [] })).code, 503);
  assert.deepEqual(h.cache, before);
});

test('strict validation rejects invalid text/types/booleans/options and duplicate identifiers', () => {
  for (const question of [{ ...q(), label: '' }, { ...q(), label: 'x'.repeat(101) }, { ...q(), type: 'script' }, { ...q(), required: 'true' }, { ...q(), type: 'select', options: ['one'] }, { ...q(), type: 'select', options: ['one', 'one'] }]) assert.throws(() => validateQuestions([question]));
  assert.throws(() => validateQuestions([q(), q()]));
  assert.throws(() => validateSections([{ key: 's', title: '', questions: [] }]));
  assert.throws(() => validateAnswers([q()], []));
  assert.throws(() => validateAnswers([{ ...q(), type: 'select', options: ['Yes', 'No'] }], [{ key: 'why', value: 'Other' }]));
  assert.deepEqual(validateAnswers([q()], [{ key: 'why', value: 'My answer' }]), [{ key: 'why', label: 'Why join?', value: 'My answer' }]);
});

test('editing a pending application retains removed answers and snapshots the original labels and values', async () => {
  const fs = require('node:fs'), vm = require('node:vm');
  const source = fs.readFileSync(require.resolve('../server'), 'utf8');
  const begin = source.indexOf("app.patch('/api/my-forms/:id',");
  const end = source.indexOf("app.delete('/api/my-forms/:id',", begin);
  const original = [{ key: 'why', label: 'Original text', value: 'Old answer' }, { key: 'deleted', label: 'Removed question', value: 'Keep this answer' }];
  const record = { id: 1, clubId: 1, committee: 'IT', status: 'pending', interviewed: false, answers: structuredClone(original) };
  const query = value => ({ select() { return this; }, lean: async () => value });
  let handler;
  vm.runInNewContext(source.slice(begin, end), {
    require: () => require('../services/club-questions'),
    app: { patch(_path, _guard, callback) { handler = callback; } }, limitMyFormAccessAttempts() {},
    getMyFormToken: () => 'test-token', canManageMyForm: () => true, applications: [record],
    mongoReady: true, Club: { findOne: () => query({ applicationFields: [q('why', 'Edited text')] }) },
    Application: { findOneAndUpdate(_filter, { $set }) { Object.assign(record, $set); return query(record); } },
    hashMyFormToken: () => 'test-hash', requireLiveDatabase: () => true, toApiRecord: value => value,
    cleanText: value => String(value || '').trim(), console
  });
  const res = { code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; } };
  await handler({ params: { id: '1' }, body: { answers: [{ key: 'why', value: 'Updated answer' }] } }, res);
  assert.equal(res.code, 200);
  assert.equal(record.answers.find(a => a.key === 'deleted').value, 'Keep this answer');
  assert.deepEqual(record.answerHistory[0].answers, original);
  assert.equal(record.answers.find(a => a.key === 'why').label, 'Edited text');
});

test('interview save rejects invalid choices and preserves removed questions and previous evaluation snapshots', async () => {
  const fs = require('node:fs'), vm = require('node:vm');
  const source = fs.readFileSync(require.resolve('../server'), 'utf8');
  const begin = source.indexOf("app.patch('/api/applications/:id/status',");
  const end = source.indexOf('\n});', begin) + 4;
  const original = [{ key: 'why', label: 'Original label', value: 'Yes' }, { key: 'deleted', label: 'Removed interview question', value: 'Historic answer' }];
  const record = { id: 1, clubId: 1, committee: 'IT', status: 'pending', interviewEvaluations: [{ scope: 'IT', answers: structuredClone(original) }] };
  const question = { ...q('why', 'Edited label'), type: 'select', options: ['Yes', 'No'] };
  const query = value => ({ select() { return this; }, lean: async () => value });
  let handler;
  vm.runInNewContext(source.slice(begin, end), {
    require: () => require('../services/club-questions'), app: { patch(_path, _guard, callback) { handler = callback; } }, requireClubAuth() {},
    applications: [record], accountCanReviewApplication: () => true, mongoReady: true,
    Club: { findOne: () => query({ interviewForms: [] }) }, getInterviewFormScope: () => 'IT', getInterviewFormSections: () => [{ questions: [question] }],
    requireLiveDatabase: () => true, Application: { findOne: () => query({ status: 'pending' }), findOneAndUpdate(_filter, { $set }) { Object.assign(record, $set); return query(record); } },
    cleanText: value => String(value || '').trim(), toApiRecord: value => value, console
  });
  const response = () => ({ code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; } });
  let res = response();
  await handler({ params: { id: '1' }, clubAccount: { clubId: 1 }, body: { interviewAnswers: [{ key: 'why', value: 'Invalid' }] } }, res);
  assert.equal(res.code, 400);
  res = response();
  await handler({ params: { id: '1' }, clubAccount: { clubId: 1 }, body: { interviewAnswers: [{ key: 'why', value: 'No' }] } }, res);
  assert.equal(res.code, 200);
  assert.equal(record.interviewEvaluations[0].answers.find(a => a.key === 'deleted').value, 'Historic answer');
  assert.deepEqual(record.interviewEvaluations[0].history[0].answers, original);
});
