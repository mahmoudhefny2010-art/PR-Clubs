const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const frontend = fs.readFileSync(require.resolve('../public/assets/js/app-forms.js'), 'utf8');
function harness({ status = 201, result, photo = true, networkError = false, deferred = false } = {}) {
  let submit, resolveRequest, calls = 0, closes = 0, resets = 0, active = true, remembered = 0;
  const button = { disabled: false, textContent: 'Submit Application' }, timers = new Map();
  const feedback = { textContent: '', classList: { add() {}, remove() {} } };
  const values = { committee: 'IT', firstName: 'Test', lastName: 'Student', email: 'student@example.test' };
  const response = { ok: status >= 200 && status < 300, status, json: async () => result || { application: { id: 123, clubId: 1 }, managementToken: 'fixture-token' } };
  const context = { require: name => require(require('node:path').resolve(__dirname, '..', name)),
    applicationSubmissionPending: false, applicationFormVersion: 1, applicationAutoCloseTimer: null,
    state: { selectedClub: { id: 1, name: 'Test Club', applicationFields: [] }, editingMyForm: null, defaultApplicantPhoto: photo ? { url: '/fixture.png' } : null },
    applicationForm: { addEventListener: (_event, handler) => { submit = handler; }, querySelector: () => button, reset: () => { resets++; } },
    FormData: class { get(key) { return values[key] || ''; } }, applicantPhotoInput: { files: [] }, applicationFeedback: feedback,
    fetch: async () => { calls++; if (networkError) throw new Error('Network unavailable'); if (deferred) return new Promise(resolve => { resolveRequest = resolve; }); return response; },
    rememberMyForm: () => { remembered++; }, clearApplicantPhotoPreview() {},
    views: { application: { classList: { contains: () => active } } },
    document: { getElementById: () => ({ click: () => { closes++; active = false; timers.clear(); } }) },
    setTimeout: (callback, delay) => { assert.equal(delay, 1200); timers.set(1, callback); return 1; }, clearTimeout: id => timers.delete(id)
  };
  vm.createContext(context);
  vm.runInContext(frontend.slice(frontend.indexOf("applicationForm.addEventListener('submit',")), context);
  return { context, button, feedback, values, submit: () => submit({ preventDefault() {} }),
    resolve: () => resolveRequest(response), tick: () => { for (const callback of [...timers.values()]) callback(); timers.clear(); },
    close: () => { active = false; closes++; timers.clear(); },
    reopen: () => { active = true; context.applicationFormVersion++; timers.clear(); feedback.textContent = ''; },
    snapshot: () => ({ calls, closes, resets, remembered, timers: timers.size }) };
}
test('confirmed new application shows the existing success message, then closes through the existing close control', async () => {
  const h = harness(); await h.submit();
  assert.equal(h.feedback.textContent, 'Your application to Test Club was submitted.');
  assert.equal(h.snapshot().closes, 0);
  assert.equal(h.snapshot().remembered, 1);
  assert.equal(h.button.disabled, true);
  await h.submit(); assert.equal(h.snapshot().calls, 1, 'Cannot resubmit during the success delay');
  h.tick(); assert.equal(h.snapshot().closes, 1);
});
test('photo validation retains entered data and never submits or schedules closing', async () => {
  const h = harness({ photo: false }); await h.submit(); h.tick();
  assert.equal(h.feedback.textContent, 'Upload your photo before submitting.');
  assert.deepEqual(h.snapshot(), { calls: 0, closes: 0, resets: 0, remembered: 0, timers: 0 });
  assert.equal(h.values.firstName, 'Test');
});
test('validation responses, database/server errors and network failures retain the form and allow retry', async () => {
  for (const options of [{ status: 400, result: { message: 'Required answer missing' } }, { status: 503, result: { message: 'Database unavailable' } }, { status: 500 }, { networkError: true }]) {
    const h = harness(options); await h.submit(); h.tick();
    assert.equal(h.snapshot().closes, 0); assert.equal(h.snapshot().resets, 0);
    assert.equal(h.snapshot().remembered, 0); assert.equal(h.button.disabled, false);
    assert.ok(h.feedback.textContent); assert.equal(h.values.email, 'student@example.test');
  }
});
test('an unconfirmed success response never clears the form or auto-closes it', async () => {
  for (const options of [{ status: 200 }, { result: { application: { id: 123, clubId: 2 }, managementToken: 'token' } }, { result: { application: { id: 123, clubId: 1 }, managementToken: '' } }, { result: {} }]) {
    const h = harness(options); await h.submit(); h.tick();
    assert.equal(h.snapshot().closes, 0); assert.equal(h.snapshot().resets, 0);
    assert.match(h.feedback.textContent, /could not link it to My Forms/);
  }
});
test('duplicate submit events while the backend is pending make one request', async () => {
  const h = harness({ deferred: true }); const first = h.submit(); await h.submit();
  assert.equal(h.snapshot().calls, 1); assert.equal(h.button.disabled, true);
  assert.equal(h.snapshot().resets, 0); assert.equal(h.snapshot().timers, 0);
  h.resolve(); await first; h.tick(); assert.equal(h.snapshot().closes, 1);
});
test('editing an existing application keeps its existing save behavior', async () => {
  const h = harness({ status: 200 });
  h.context.state.editingMyForm = { id: 123, token: 'fixture-token' };
  h.context.state.myForms = [];
  h.context.loadMyForms = async () => {};
  await h.submit(); h.tick();
  assert.equal(h.feedback.textContent, 'Your changes were saved.');
  assert.equal(h.snapshot().closes, 0);
  assert.equal(h.snapshot().resets, 0);
  assert.equal(h.button.disabled, false);
});
test('manual close remains available while submitting and after success; reopening is not reset or closed by an old response', async () => {
  const h = harness({ deferred: true }); const first = h.submit();
  h.close(); h.reopen(); h.resolve(); await first; h.tick();
  assert.equal(h.snapshot().closes, 1); assert.equal(h.snapshot().resets, 0);
  assert.equal(h.feedback.textContent, ''); assert.equal(h.snapshot().remembered, 1);
  const success = harness(); await success.submit(); success.close(); success.tick();
  assert.equal(success.snapshot().closes, 1);
});

test('the real backend handler responds 201 only after database creation finishes and reports database failures without success', async () => {
  const source = fs.readFileSync(require.resolve('../server'), 'utf8');
  const start = source.indexOf("app.post('/api/applications',");
  const fragment = source.slice(start, source.indexOf("app.get('/api/student/my-forms',", start));
  for (const fails of [false, true]) {
    let handler, finishSave;
    const records = [], chain = value => ({ read() { return this; }, readConcern() { return this; }, select() { return this; }, lean: async () => value });
    const context = { require: name => require(require('node:path').resolve(__dirname, '..', name)), app: { post: (_path, callback) => { handler = callback; } }, applications: records,
      requireLiveDatabase: () => true, Club: { findOne: () => chain({ id: 1, status: 'open', applicationFields: [] }) },
      clubAccounts: [{ clubId: 1, role: 'head', committee: 'IT' }], getManagedCommittees: () => ['IT'], getCommitteeApplicationStatus: () => 'open',
      cleanText: value => String(value || '').trim(), getStudentAccountFromRequest: async () => null,
      getApplicantPhoto: async () => ({ url: '/fixture.png' }), generateMyFormCode: () => 'fixture-token', hashMyFormToken: () => 'fixture-hash',
      Application: { findOne: () => chain(null), create: () => new Promise((resolve, reject) => { finishSave = () => fails ? reject(new Error('Database failed')) : resolve(); }) },
      toApiRecord: record => record, console: { error() {} }
    };
    vm.runInNewContext(fragment, context);
    const response = { code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; } };
    const pending = handler({ body: { clubId: 1, committee: 'IT', email: 'student@example.test' } }, response);
    for (let attempts = 0; !finishSave && attempts < 100; attempts++) await new Promise(resolve => setImmediate(resolve));
    assert.ok(finishSave, JSON.stringify(response.body));
    assert.equal(response.body, undefined, 'No success response before the write settles');
    finishSave(); await pending;
    assert.equal(response.code, fails ? 503 : 201);
    assert.equal(records.length, fails ? 0 : 1);
    assert.equal(Boolean(response.body.application), !fails);
  }
});
