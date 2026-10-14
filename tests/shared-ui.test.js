const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
function setup(fetch) {
  const window = {};
  vm.runInNewContext(fs.readFileSync(require.resolve('../public/assets/js/shared.js'), 'utf8'), { window, fetch });
  return window.MiuUI;
}
test('modal visibility preserves unrelated classes and adds no lifecycle side effects', () => {
  const classes = new Set(['hidden', 'calendar-modal']);
  const modal = { classList: { add: value => classes.add(value), remove: value => classes.delete(value) } };
  const ui = setup();
  ui.modals.open(modal);
  assert.deepEqual([...classes], ['calendar-modal']);
  ui.modals.close(modal);
  ui.modals.close(modal);
  assert.deepEqual([...classes], ['calendar-modal', 'hidden']);
});
test('shared escaping preserves null, numeric, Unicode and HTML attribute output', () => {
  const ui = setup();
  assert.equal(ui.escapeHtml(null), '');
  assert.equal(ui.escapeHtml(undefined), '');
  assert.equal(ui.escapeHtml(0), '0');
  assert.equal(ui.escapeHtml('مرحبا <&>"\''), 'مرحبا &lt;&amp;&gt;&quot;&#39;');
});
test('JSON client preserves URL, options, body, overrides and successful payload', async () => {
  const calls = [];
  const payload = { saved: true };
  const ui = setup(async (...args) => { calls.push(args); return { ok: true, json: async () => payload }; });
  const api = ui.createJsonClient({ defaults: { cache: 'no-store', credentials: 'same-origin' }, fallbackMessage: 'Failed' });
  const options = { method: 'POST', body: '{"id":"001"}', headers: { 'Content-Type': 'application/json' }, cache: 'reload' };
  assert.equal(await api('/api/existing?club=42', options), payload);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], '/api/existing?club=42');
  assert.equal(JSON.stringify(calls[0][1]), JSON.stringify({ cache: 'reload', credentials: 'same-origin', ...options }));
});
test('JSON client preserves per-feature parse, fallback and HTTP-status policy', async () => {
  const ui = setup(async () => ({ ok: false, status: 401, json: async () => ({ message: 'Sign in required' }) }));
  await assert.rejects(ui.createJsonClient({ fallbackMessage: 'Fallback', includeStatus: true })('/api/existing'), error => error.message === 'Sign in required' && error.status === 401);
  const invalid = setup(async () => ({ ok: false, status: 503, json: async () => { throw new SyntaxError('Invalid JSON'); } }));
  await assert.rejects(invalid.createJsonClient({ fallbackMessage: 'Attendance unavailable' })('/api/existing'), error => error.message === 'Attendance unavailable' && !('status' in error));
  await assert.rejects(invalid.createJsonClient({ fallbackMessage: 'Fallback', tolerateInvalidJson: false })('/api/existing'), SyntaxError);
  const success = setup(async () => ({ ok: true, json: async () => { throw new SyntaxError('Invalid JSON'); } }));
  assert.equal(JSON.stringify(await success.createJsonClient({})('/api/existing')), '{}');
});
