const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
function fixture(reload = false, stored = null) {
  let listener, timer, value = stored, clicked = [];
  const nav = { querySelector: () => controls[0], querySelectorAll: () => controls };
  const controls = ['overview', 'events', 'reports'].map(name => ({
    tagName: 'BUTTON', disabled: false,
    matches: () => false, hasAttribute: key => key === 'data-panel',
    getAttribute: key => key === 'data-panel' ? name : null,
    getClientRects: () => [1], closest: selector => selector === '.view' ? null : nav,
    click() { clicked.push(name); listener({ target: { closest: () => this }, isTrusted: false }); }
  }));
  const window = {};
  vm.runInNewContext(fs.readFileSync(require.resolve('../public/assets/js/dashboard-navigation.js'), 'utf8'), {
    window, location: { pathname: '/dashboard' }, performance: { getEntriesByType: () => [{ type: reload ? 'reload' : 'navigate' }] },
    sessionStorage: { getItem: () => value, setItem: (key, text) => value = text },
    document: { querySelectorAll: () => [nav], documentElement: { classList: { contains: () => false } }, addEventListener: (name, callback) => listener = callback },
    setInterval: callback => { timer = callback; return 1; }, clearInterval() {}, Date
  });
  return { window, clicked, stored: () => value, tick: () => timer?.(), choose: index => listener({ target: { closest: () => controls[index] }, isTrusted: true }) };
}
test('Back traverses previously selected dashboard sections in order', () => {
  const f = fixture(); f.choose(1); f.choose(2);
  assert.equal(f.window.miuDashboardGoBack(), true); assert.deepEqual(f.clicked, ['events']);
  assert.equal(f.window.miuDashboardGoBack(), true); assert.deepEqual(f.clicked, ['events', 'overview']);
  assert.equal(f.window.miuDashboardGoBack(), false);
});
test('refresh restores the selected section without adding a duplicate history entry', () => {
  const f = fixture(); f.choose(1); f.choose(2);
  const restored = fixture(true, f.stored()); restored.tick();
  assert.deepEqual(restored.clicked, ['reports']);
  restored.window.miuDashboardGoBack(); assert.deepEqual(restored.clicked, ['reports', 'events']);
});
test('a user choice wins over pending refresh restoration', () => {
  const f = fixture(); f.choose(2);
  const restored = fixture(true, f.stored()); restored.choose(1); restored.tick();
  assert.deepEqual(restored.clicked, []);
});
test('a new dashboard visit clears the old saved section instead of restoring it later', () => {
  const oldState = JSON.stringify({ current: { attribute: 'data-panel', value: 'reports' }, stack: [{ attribute: 'data-panel', value: 'events' }] });
  const fresh = fixture(false, oldState);
  assert.deepEqual(JSON.parse(fresh.stored()), { current: null, stack: [] });
});
