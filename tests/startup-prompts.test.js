const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function queue() {
  const timers = new Map();
  const dialogs = [];
  let blocked = false;
  let observer;
  let timer = 0;
  const window = {};
  const document = {
    visibilityState: 'visible', documentElement: { classList: { contains: () => false } },
    querySelector: () => blocked || dialogs.some(d => d.open), addEventListener() {}
  };
  const code = fs.readFileSync(require.resolve('../public/assets/js/site-loading.js'), 'utf8').split('  const root = document.documentElement;')[0] + '})();';
  vm.runInNewContext(code, { window, document,
    setTimeout: fn => { timers.set(++timer, fn); return timer; }, clearTimeout: id => timers.delete(id),
    MutationObserver: class { constructor(fn) { observer = fn; } observe() {} }
  });
  const dialog = () => {
    const listeners = {};
    const value = { open: false, shows: 0,
      addEventListener: (name, fn) => { listeners[name] = fn; },
      showModal() { assert.equal(dialogs.some(d => d.open), false); this.open = true; this.shows++; },
      close() { this.open = false; listeners.close?.(); }
    };
    dialogs.push(value); return value;
  };
  const tick = () => { const pending = [...timers.values()]; timers.clear(); pending.forEach(fn => fn()); };
  return { window, dialog, tick, block(value) { blocked = value; observer(); } };
}

test('first-login dialogs open sequentially and duplicate queue requests are ignored', () => {
  const q = queue();
  const photo = q.dialog(), notifications = q.dialog(), install = q.dialog();
  q.window.queueSitePrompt('photo', photo);
  q.window.queueSitePrompt('photo', photo);
  q.window.queueSitePrompt('notifications', notifications);
  q.window.queueSitePrompt('install', install);
  q.tick(); assert.equal(photo.open, true); assert.equal(notifications.open, false);
  photo.close(); q.tick(); assert.equal(notifications.open, true);
  notifications.close(); q.tick(); assert.equal(install.open, true);
  assert.equal(photo.shows, 1);
});

test('prompts wait for other modals and skip prompts that are no longer needed', () => {
  const q = queue(); const skipped = q.dialog(), next = q.dialog();
  q.block(true);
  q.window.queueSitePrompt('skip', skipped, { eligible: () => false });
  q.window.queueSitePrompt('next', next);
  q.tick(); assert.equal(next.open, false);
  q.block(false); q.tick(); q.tick();
  assert.equal(skipped.shows, 0); assert.equal(next.open, true);
});
