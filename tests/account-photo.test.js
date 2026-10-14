const test = require('node:test');
const assert = require('node:assert/strict');
const { registerAccountPhotoRoutes } = require('../services/account-photo');

function setup({ email = 'Student@miuegypt.edu.eg', sameOrigin = true, valid = true, ready = true, notifyLater } = {}) {
  const routes = {};
  let saved = null;
  const model = {
    findOne(query) { assert.equal(query.email, 'student@miuegypt.edu.eg'); return { lean: async () => saved }; },
    findOneAndUpdate(query, update, options) {
      assert.deepEqual(query, { email: 'student@miuegypt.edu.eg' });
      assert.equal(options.upsert, true);
      saved = { ...saved, ...update.$set };
      return { lean: async () => saved };
    }
  };
  registerAccountPhotoRoutes({ get: (path, handler) => { routes.get = handler; }, put: (path, handler) => { routes.put = handler; } }, {
    model, notifyLater, getEmail: async () => email, sameOrigin: () => sameOrigin,
    databaseReady: () => ready,
    validatePhoto: async (url, publicId) => valid ? { url, publicId } : null
  });
  return async (method, body = {}) => {
    const res = { code: 200, setHeader() {}, status(code) { this.code = code; return this; }, json(value) { this.body = value; return this; } };
    await routes[method]({ body }, res);
    return res;
  };
}

test('photo persists for the authenticated email and ignores a supplied account email', async () => {
  const request = setup();
  assert.equal((await request('get')).body, null);
  const photo = { url: 'https://res.cloudinary.com/example/image/upload/photo.jpg', publicId: 'miu-applicants-photo' };
  assert.deepEqual((await request('put', { ...photo, email: 'other@example.com' })).body, { ...photo, promptDismissed: true });
  assert.deepEqual((await request('get')).body, { ...photo, promptDismissed: true });
});

test('Maybe later persists without a photo and preserves an existing photo', async () => {
  const request = setup();
  assert.deepEqual((await request('put', { promptDismissed: true })).body,
    { url: '', publicId: '', promptDismissed: true });
  assert.equal((await request('get')).body.promptDismissed, true);
  await request('put', { url: 'photo-url', publicId: 'photo-id' });
  assert.deepEqual((await request('put', { promptDismissed: true })).body,
    { url: 'photo-url', publicId: 'photo-id', promptDismissed: true });
});

test('photo writes reject unauthenticated, cross-origin, invalid and offline requests', async () => {
  for (const [options, expected] of [[{ email: '' }, 401], [{ sameOrigin: false }, 403], [{ valid: false }, 422], [{ ready: false }, 503]]) {
    assert.equal((await setup(options)('put', {})).code, expected);
  }
});

test('reminder is triggered only for postponing without a saved photo', async () => {
  const emails = [];
  const request = setup({ notifyLater: async (req, email) => { emails.push(email); } });
  await request('put', { promptDismissed: true });
  assert.deepEqual(emails, ['student@miuegypt.edu.eg']);
  await request('put', { url: 'photo-url', publicId: 'photo-id' });
  await request('put', { promptDismissed: true });
  assert.equal(emails.length, 1);
});
