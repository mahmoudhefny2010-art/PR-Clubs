const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const clientSource = fs.readFileSync(require.resolve('../public/assets/js/onesignal-notifications.js'), 'utf8');

function createClientHarness({ session, externalId = 'student-1', permissionResult = 'granted' }) {
  const calls = { logins: [], logouts: 0, optIns: 0, optOuts: 0, addEmails: [], removeEmails: [], initOptions: null };
  const windowListeners = new Map();
  const deferred = [];
  const pushListeners = new Map();
  const notificationListeners = new Map();
  const toggleListeners = new Map();
  const status = { hidden: true, textContent: '' };
  const toggle = { hidden: true, disabled: false, textContent: '', addEventListener: (name, callback) => toggleListeners.set(name, callback) };
  const emailStatus = { hidden: true, textContent: '' };
  const emailToggle = { hidden: true, disabled: false, textContent: '', addEventListener: (name, callback) => toggleListeners.set(`email-${name}`, callback) };
  let optedIn = false;
  let currentSession = session;
  let currentExternalId = externalId;
  let identityStatus = 200;
  let nextPermissionResult = permissionResult;
  const oneSignal = {
    init: async (options) => { calls.initOptions = options; },
    login: async (id) => { calls.logins.push(id); },
    logout: async () => { calls.logouts += 1; },
    User: {
      addEmail: async (email) => { calls.addEmails.push(email); },
      removeEmail: async (email) => { calls.removeEmails.push(email); },
      PushSubscription: {
        get optedIn() { return optedIn; },
        optIn: async () => {
          calls.optIns += 1;
          optedIn = nextPermissionResult === 'granted';
          sandbox.Notification.permission = nextPermissionResult;
          for (const callback of notificationListeners.get('permissionChange') || []) callback(true);
          for (const callback of pushListeners.get('change') || []) callback({ current: { optedIn: true } });
        },
        optOut: async () => {
          calls.optOuts += 1;
          optedIn = false;
          for (const callback of pushListeners.get('change') || []) callback({ current: { optedIn: false } });
        },
        addEventListener: (name, callback) => {
          const items = pushListeners.get(name) || [];
          items.push(callback);
          pushListeners.set(name, items);
        }
      }
    },
    Notifications: {
      permission: false,
      isPushSupported: () => true,
      addEventListener: (name, callback) => {
        const items = notificationListeners.get(name) || [];
        items.push(callback);
        notificationListeners.set(name, items);
      }
    }
  };
  const sandbox = {
    setTimeout, clearTimeout,
    localStorage: { getItem: () => "seen" },
    console: { warn: () => {} },
    Notification: { permission: 'default' },
    location: { hostname: 'localhost' },
    document: {
      querySelector: () => null,
      getElementById: (id) => ({ headerNotificationToggle: toggle, headerNotificationStatus: status, headerEmailNotificationToggle: emailToggle, headerEmailNotificationStatus: emailStatus })[id] || null,
      createElement: () => ({ dataset: {}, async: false, onerror: null }),
      head: { appendChild: () => {
        for (const callback of deferred.splice(0)) callback(oneSignal);
      } }
    },
    fetch: async (url) => {
      if (url === '/api/notifications/config') return { ok: true, json: async () => ({ enabled: true, appId: '123e4567-e89b-42d3-a456-426614174000' }) };
      if (url === '/api/notifications/identity') return { ok: identityStatus === 200, status: identityStatus,
        json: async () => ({ externalId: currentExternalId, email: currentSession?.type === 'student' ? 'student@miuegypt.edu.eg' : '',
          emailSupported: currentSession?.type === 'student', emailNotificationsEnabled: false }) };
      if (url === '/api/notifications/email-preference') return { ok: true, json: async () => ({ emailNotificationsEnabled: true }) };
      throw new Error(`Unexpected request ${url}`);
    },
    CustomEvent: function CustomEvent(name, options) { this.type = name; this.detail = options?.detail; }
  };
  sandbox.window = sandbox;
  sandbox.__miuAccountSession = currentSession;
  sandbox.OneSignalDeferred = deferred;
  sandbox.addEventListener = (name, callback) => {
    const items = windowListeners.get(name) || [];
    items.push(callback);
    windowListeners.set(name, items);
  };
  vm.runInNewContext(clientSource, sandbox, { filename: 'onesignal-notifications.js' });

  return {
    calls, toggle, status, emailToggle, emailStatus, sandbox, currentSession: (value) => { currentSession = value; },
    externalId: (value) => { currentExternalId = value; },
    identityStatus: (value) => { identityStatus = value; },
    permissionResult: (value) => { nextPermissionResult = value; },
    async sessionChanged(value) {
      const callback = windowListeners.get('miu:push-account-session-changed')[0];
      await callback({ detail: value });
    },
    async flush() {
      for (let index = 0; index < 8; index += 1) await new Promise((resolve) => setImmediate(resolve));
    },
    async click() { await toggleListeners.get('click')(); },
    async clickEmail() { await toggleListeners.get('email-click')(); },
    changePermission() {
      for (const callback of notificationListeners.get('permissionChange') || []) callback(false);
    },
    changeSubscription() {
      for (const callback of pushListeners.get('change') || []) callback({ current: { optedIn } });
    }
  };
}

test('restores a signed-in student, opts in only after a click, and reflects subscription changes', async () => {
  const harness = createClientHarness({ session: { authenticated: true, type: 'student' } });
  await harness.flush();
  assert.deepEqual(harness.calls.logins, ['student-1']);
  assert.equal(harness.calls.initOptions.serviceWorkerPath, '/push/onesignal/OneSignalSDKWorker.js');
  assert.equal(harness.calls.initOptions.serviceWorkerParam.scope, '/push/onesignal/');
  assert.equal(harness.toggle.textContent, 'Turn on notifications');

  await harness.click();
  assert.equal(harness.calls.optIns, 1);
  assert.equal(harness.toggle.textContent, 'Turn off notifications');
  assert.match(harness.status.textContent, /preference has been updated/);

  await harness.click();
  assert.equal(harness.calls.optOuts, 1);
  assert.equal(harness.toggle.textContent, 'Turn on notifications');
});

test('email subscription is linked only after a student explicitly enables email updates', async () => {
  const harness = createClientHarness({ session: { authenticated: true, type: 'student' } });
  await harness.flush();
  assert.equal(harness.emailToggle.textContent, 'Turn on email updates');
  assert.deepEqual(harness.calls.addEmails, []);
  await harness.clickEmail();
  assert.deepEqual(harness.calls.addEmails, ['student@miuegypt.edu.eg']);
  assert.equal(harness.emailToggle.textContent, 'Turn off email updates');
});

test('denied permission and account changes are handled; logout unsubscribes and unlinks', async () => {
  const harness = createClientHarness({ session: { authenticated: true, type: 'student' } });
  await harness.flush();

  harness.sandbox.Notification.permission = 'denied';
  harness.changePermission();
  assert.equal(harness.toggle.disabled, true);
  assert.equal(harness.toggle.textContent, 'Notifications blocked');
  assert.match(harness.status.textContent, /browser settings/);

  harness.sandbox.Notification.permission = 'default';
  harness.externalId('student-2');
  await harness.sessionChanged({ authenticated: true, type: 'student' });
  assert.deepEqual(harness.calls.logins, ['student-1', 'student-2']);

  await harness.sessionChanged({ authenticated: false });
  assert.equal(harness.calls.optOuts, 1);
  assert.equal(harness.calls.logouts, 1);
});

test('a dismissed permission prompt leaves push off with a retryable explanation', async () => {
  const harness = createClientHarness({ session: { authenticated: true, type: 'student' }, permissionResult: 'default' });
  await harness.flush();
  await harness.click();
  assert.equal(harness.toggle.textContent, 'Turn on notifications');
  assert.match(harness.status.textContent, /No permission was granted/);
});

test('club representatives, supervisors and committee accounts can enable push with their own identity', async () => {
  for (const role of ['president', 'head', 'supervisor', 'pr', 'english', 'security', 'sso', 'dean']) {
    const id = `club-account:${role}`;
    const harness = createClientHarness({ session: { authenticated: true, type: 'club', role }, externalId: id });
    await harness.flush();
    assert.deepEqual(harness.calls.logins, [id]);
    assert.equal(harness.toggle.disabled, false);
    assert.equal(harness.emailToggle.hidden, true);
    await harness.click();
    assert.equal(harness.toggle.textContent, 'Turn off notifications');
  }
});
test('admin accounts can bind push independently without student email preferences', async () => {
  const harness = createClientHarness({ session: { authenticated: true, type: 'admin' }, externalId: 'admin-account:opaque-id' });
  await harness.flush();
  assert.deepEqual(harness.calls.logins, ['admin-account:opaque-id']);
  await harness.click();
  assert.equal(harness.calls.optIns, 1);
  assert.equal(harness.emailToggle.hidden, true);
});
test('a temporary identity lookup failure can be retried by a club account', async () => {
  const session = { authenticated: true, type: 'club', role: 'supervisor' };
  const harness = createClientHarness({ session, externalId: 'club-account:supervisor' });
  await harness.flush();
  harness.identityStatus(503);
  await harness.sessionChanged(session);
  assert.equal(harness.toggle.textContent, 'Retry notifications');
  assert.equal(harness.toggle.disabled, false);
  assert.equal(harness.emailStatus.hidden, true);
  harness.identityStatus(200);
  await harness.click();
  assert.equal(harness.toggle.textContent, 'Turn on notifications');
});
