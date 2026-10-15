const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
const start = source.indexOf("app.post('/api/uploads/cloudinary-signature'");
const handlerSource = source.slice(start, source.indexOf('const defaultClubs', start));
function handler({ admin = false, role, configured = true } = {}) {
  let route;
  vm.runInNewContext(handlerSource, {
    app: { post(url, callback) { route = callback; } },
    cloudinaryConfigured: configured, cloudinaryFolders: { club: 'miu-clubs' },
    getClubAccountFromRequest: async () => role ? { role } : null,
    isAdminSessionValid: async () => admin,
    signCloudinaryUpload: folder => ({ folder, signature: 'fixture-signature' }),
    MAX_IMAGE_UPLOAD_BYTES: 10 * 1024 * 1024, console
  });
  return async body => {
    const res = { code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
    await route({ body: body || { purpose: 'club' } }, res);
    return res;
  };
}
test('club images accept verified primary and delegated admins while preserving existing role permissions', async () => {
  for (const identity of [{ admin: true }, { admin: true, role: 'software_development' }, ...['president', 'pr', 'english', 'security', 'sso', 'dean'].map(role => ({ role }))]) {
    const res = await handler(identity)();
    assert.equal(res.code, 200); assert.equal(res.body.folder, 'miu-clubs');
  }
  for (const role of [undefined, 'student', 'head', 'supervisor', 'software_development']) {
    const res = await handler({ role })({ purpose: 'club', role: 'admin' });
    assert.equal(res.code, 403, 'A requested role or unverified role name grants no admin authority');
  }
});
test('missing Cloudinary configuration and unsupported upload purposes fail explicitly', async () => {
  assert.equal((await handler({ admin: true, configured: false })()).code, 503);
  assert.equal((await handler({ admin: true })({ purpose: 'unknown' })).code, 400);
});
