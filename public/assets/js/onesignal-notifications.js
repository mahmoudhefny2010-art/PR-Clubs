(function () {
  const toggle = document.getElementById('headerNotificationToggle');
  const status = document.getElementById('headerNotificationStatus');
  const emailToggle = document.getElementById('headerEmailNotificationToggle');
  const emailStatus = document.getElementById('headerEmailNotificationStatus');
  if (!toggle || !status || !emailToggle || !emailStatus) return;

  let oneSignalInstance = null;
  let initialization = null;
  let activeExternalId = '';
  let activeEmail = '';
  let emailEnabled = false;
  let sdkUnavailable = false;
  let settingsLoading = false;
  let settingsError = '';
  let sessionRevision = 0;

  function withTimeout(promise, milliseconds, code) {
    let timer;
    return Promise.race([
      promise,
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(code)), milliseconds); })
    ]).finally(() => clearTimeout(timer));
  }

  function announce(message) {
    status.textContent = message;
    status.hidden = !message;
  }

  function render() {
    if (sdkUnavailable) {
      toggle.disabled = true;
      toggle.textContent = 'Notifications unavailable';
      announce('Push notifications are not configured for this site yet.');
      emailToggle.disabled = true;
      emailToggle.textContent = 'Email updates unavailable';
      emailStatus.textContent = 'Email updates are not configured for this site yet.';
      emailStatus.hidden = false;
      return;
    }
    if (settingsLoading) {
      toggle.disabled = true;
      toggle.textContent = 'Preparing notifications...';
      announce('Loading your secure notification settings...');
      emailToggle.disabled = true;
      emailToggle.textContent = 'Preparing email updates...';
      return;
    }
    if (settingsError) {
      toggle.disabled = true;
      toggle.textContent = 'Notifications unavailable';
      announce(settingsError);
      emailToggle.disabled = true;
      emailToggle.textContent = 'Email updates unavailable';
      emailStatus.textContent = settingsError;
      emailStatus.hidden = false;
      return;
    }
    if (!oneSignalInstance) return;
    if (!activeExternalId) {
      toggle.disabled = true;
      toggle.textContent = 'Preparing notifications…';
      announce('Loading your secure notification settings…');
      emailToggle.disabled = true;
      emailToggle.textContent = 'Preparing email updates...';
      return;
    }
    emailToggle.disabled = false;
    emailToggle.textContent = emailEnabled ? 'Turn off email updates' : 'Turn on email updates';
    emailStatus.textContent = emailEnabled
      ? 'You will receive relevant club updates at your student account email.'
      : 'Email updates are off. Turn them on when you are ready.';
    emailStatus.hidden = false;
    const supported = oneSignalInstance.Notifications.isPushSupported();
    const permissionDenied = typeof Notification !== 'undefined' && Notification.permission === 'denied';
    if (!supported) {
      toggle.disabled = true;
      toggle.textContent = 'Notifications unavailable';
      announce('This browser or device does not support web push notifications.');
      return;
    }
    const optedIn = Boolean(oneSignalInstance.User.PushSubscription.optedIn);
    toggle.disabled = permissionDenied;
    toggle.textContent = optedIn ? 'Turn off notifications' : permissionDenied ? 'Notifications blocked' : 'Turn on notifications';
    announce(permissionDenied
      ? 'Notifications are blocked in browser settings. Change this site’s permission there to enable them.'
      : optedIn ? 'You are subscribed to relevant club updates.' : 'Push notifications are off. You can turn them on when you are ready.');
  }

  async function loadOneSignal() {
    if (initialization) return initialization;
    initialization = (async () => {
      const configResponse = await withTimeout(fetch('/api/notifications/config', { cache: 'no-store' }), 10000, 'ONESIGNAL_CONFIG_TIMEOUT');
      const config = configResponse.ok ? await configResponse.json() : { enabled: false };
      if (!config.enabled || !config.appId) {
        sdkUnavailable = true;
        render();
        return null;
      }

      window.OneSignalDeferred = window.OneSignalDeferred || [];
      let resolveSdk;
      let rejectSdk;
      const sdkReady = new Promise((resolve, reject) => { resolveSdk = resolve; rejectSdk = reject; });
      window.OneSignalDeferred.push(async (OneSignal) => {
        try {
          await OneSignal.init({
            appId: config.appId,
            serviceWorkerPath: 'push/onesignal/OneSignalSDKWorker.js',
            serviceWorkerParam: { scope: '/push/onesignal/' },
            allowLocalhostAsSecureOrigin: ['localhost', '127.0.0.1'].includes(location.hostname)
          });
          resolveSdk(OneSignal);
        } catch (error) {
          rejectSdk(error);
        }
      });

      const script = document.createElement('script');
      script.src = 'https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js';
      script.async = true;
      script.onerror = () => rejectSdk(new Error('OneSignal SDK failed to load.'));
      document.head.appendChild(script);
      oneSignalInstance = await withTimeout(sdkReady, 12000, 'ONESIGNAL_SDK_TIMEOUT');
      oneSignalInstance.User.PushSubscription.addEventListener('change', render);
      oneSignalInstance.Notifications.addEventListener('permissionChange', render);
      render();
      return oneSignalInstance;
    })().catch((error) => {
      console.warn('Push notifications are currently unavailable:', error.name || 'Error');
      sdkUnavailable = true;
      render();
      return null;
    });
    return initialization;
  }

  async function setSession(session) {
    const revision = ++sessionRevision;
    if (!session?.authenticated || session.type !== 'student') {
      if (oneSignalInstance && activeExternalId) {
        await oneSignalInstance.User.PushSubscription.optOut().catch(() => {});
        await oneSignalInstance.logout().catch(() => {});
        activeExternalId = '';
        activeEmail = '';
        emailEnabled = false;
      }
      settingsLoading = false;
      settingsError = '';
      render();
      return;
    }

    settingsLoading = true;
    settingsError = '';
    render();
    try {
      const OneSignal = await loadOneSignal();
      if (!OneSignal || revision !== sessionRevision) return;
      const identityResponse = await withTimeout(fetch('/api/notifications/identity', {
        cache: 'no-store', credentials: 'same-origin'
      }), 10000, 'NOTIFICATION_IDENTITY_TIMEOUT');
      if (!identityResponse.ok) throw new Error(`NOTIFICATION_IDENTITY_HTTP_${identityResponse.status}`);
      const identity = await identityResponse.json();
      if (!identity.externalId) throw new Error('NOTIFICATION_IDENTITY_MISSING');
      if (revision !== sessionRevision) return;
      if (identity.externalId !== activeExternalId) {
        if (activeExternalId && activeEmail) await OneSignal.User.removeEmail(activeEmail).catch(() => {});
        await withTimeout(OneSignal.login(identity.externalId), 10000, 'ONESIGNAL_IDENTITY_TIMEOUT');
      }
      if (revision !== sessionRevision) {
        await OneSignal.User.PushSubscription.optOut().catch(() => {});
        await OneSignal.logout().catch(() => {});
        return;
      }
      activeExternalId = identity.externalId;
      activeEmail = identity.email || '';
      emailEnabled = Boolean(identity.emailNotificationsEnabled);
      if (emailEnabled && activeEmail) {
        await withTimeout(OneSignal.User.addEmail(activeEmail), 10000, 'ONESIGNAL_EMAIL_RESTORE_TIMEOUT').catch((error) => {
          console.warn('Email subscription could not be restored:', error.name || 'Error');
        });
      }
    } catch (error) {
      if (revision === sessionRevision) {
        settingsError = 'Notification settings could not be loaded. Check your connection and reload the page to try again.';
        if (activeExternalId && oneSignalInstance) {
          await oneSignalInstance.User.PushSubscription.optOut().catch(() => {});
          await oneSignalInstance.logout().catch(() => {});
          activeExternalId = '';
          activeEmail = '';
          emailEnabled = false;
        }
        console.warn('Notification settings could not be loaded:', error.name || 'Error');
      }
    } finally {
      if (revision === sessionRevision) {
        settingsLoading = false;
        render();
      }
    }
  }

  toggle.addEventListener('click', async () => {
    toggle.disabled = true;
    announce('Updating your notification preference…');
    let outcomeMessage = '';
    try {
      const OneSignal = await loadOneSignal();
      if (!OneSignal) return;
      if (OneSignal.User.PushSubscription.optedIn) {
        await OneSignal.User.PushSubscription.optOut();
        outcomeMessage = 'Push notifications are off for this browser.';
      } else if (typeof Notification !== 'undefined' && Notification.permission === 'denied') {
        outcomeMessage = 'Notifications are blocked in browser settings. Change this site’s permission there to enable them.';
      } else {
        await OneSignal.User.PushSubscription.optIn();
        outcomeMessage = Notification.permission === 'granted'
          ? 'Your notification preference has been updated.'
          : 'No permission was granted. You can try again whenever you are ready.';
      }
    } catch (error) {
      outcomeMessage = 'We could not update notifications right now. Please try again later.';
      console.warn('Push preference update failed:', error.name || 'Error');
    } finally {
      render();
      if (outcomeMessage) announce(outcomeMessage);
    }
  });

  emailToggle.addEventListener('click', async () => {
    emailToggle.disabled = true;
    emailStatus.textContent = 'Updating your email preference...';
    emailStatus.hidden = false;
    try {
      const OneSignal = await loadOneSignal();
      if (!OneSignal || !activeExternalId || !activeEmail) throw new Error('EMAIL_IDENTITY_UNAVAILABLE');
      const enabled = !emailEnabled;
      if (enabled) await OneSignal.User.addEmail(activeEmail);
      const response = await fetch('/api/notifications/email-preference', {
        method: 'PUT',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled })
      });
      if (!response.ok) {
        if (enabled) await OneSignal.User.removeEmail(activeEmail).catch(() => {});
        throw new Error('PREFERENCE_SAVE_FAILED');
      }
      emailEnabled = enabled;
      if (!enabled) await OneSignal.User.removeEmail(activeEmail).catch(() => {});
    } catch (error) {
      emailStatus.textContent = 'We could not update your email preference. Please try again.';
      console.warn('Email notification preference update failed:', error.name || 'Error');
    } finally {
      render();
    }
  });

  window.miuPushNotifications = {
    setSession,
    async logout() {
      sessionRevision += 1;
      if (oneSignalInstance && activeExternalId) {
        await oneSignalInstance.User.PushSubscription.optOut().catch(() => {});
        await oneSignalInstance.logout().catch(() => {});
      }
      activeExternalId = '';
      activeEmail = '';
      emailEnabled = false;
      render();
    }
  };

  window.addEventListener('miu:push-account-session-changed', (event) => setSession(event.detail).catch(() => {}));
  if (window.__miuAccountSession) setSession(window.__miuAccountSession).catch(() => {});
})();
