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
  let emailSupported = true;
  let sdkUnavailable = false;
  let notificationConfigMissing = false;
  let sdkUnavailableMessage = '';
  let settingsLoading = false;
  let settingsError = '';
  let sessionRevision = 0;
  let currentSession = null;
  let welcomeDialog = null;

  function welcomeStorageKey() {
    return 'miu-notification-welcome-seen';
  }

  function markWelcomeSeen() {
    const key = welcomeStorageKey();
    if (!key) return;
    try { localStorage.setItem(key, 'seen'); }
    catch (_) { try { sessionStorage.setItem(key, 'seen'); } catch (_) { /* Keep the prompt available when storage is unavailable. */ } }
  }

  function hasSeenWelcome() {
    const key = welcomeStorageKey();
    try { return Boolean(localStorage.getItem(key)); }
    catch (_) { try { return Boolean(sessionStorage.getItem(key)); } catch (_) { return false; } }
  }

  function maybeShowNotificationWelcome() {
    if (document.querySelector('dialog[open]')) {
      document.querySelector('dialog[open]').addEventListener('close', maybeShowNotificationWelcome, { once: true });
      return;
    }
    if (!oneSignalInstance || !oneSignalInstance.Notifications.isPushSupported()) return;
    if (oneSignalInstance.User.PushSubscription.optedIn) return;
    if (typeof Notification !== 'undefined' && Notification.permission === 'denied') return;
    if (hasSeenWelcome()) return;

    if (!welcomeDialog) {
      welcomeDialog = document.createElement('dialog');
      welcomeDialog.className = 'notification-welcome-dialog';
      welcomeDialog.setAttribute('aria-labelledby', 'notificationWelcomeTitle');
      welcomeDialog.innerHTML = `
        <div class="notification-welcome-icon" aria-hidden="true">🔔</div>
        <h2 id="notificationWelcomeTitle">Stay up to date with MIU Clubs</h2>
        <p>Get a notification when a club posts an announcement, event, or update. You can turn this off any time from your account menu.</p>
        <p class="notification-welcome-feedback" role="status" aria-live="polite"></p>
        <div class="notification-welcome-actions">
          <button class="notification-welcome-enable" type="button">Turn on notifications</button>
          <button class="notification-welcome-later" type="button">Maybe later</button>
        </div>`;
      document.body.append(welcomeDialog);
      welcomeDialog.querySelector('.notification-welcome-later').addEventListener('click', () => {
        markWelcomeSeen();
        welcomeDialog.close();
      });
      welcomeDialog.addEventListener('cancel', markWelcomeSeen);
      welcomeDialog.querySelector('.notification-welcome-enable').addEventListener('click', async (event) => {
        const button = event.currentTarget;
        const feedback = welcomeDialog.querySelector('.notification-welcome-feedback');
        button.disabled = true;
        feedback.textContent = '';
        try {
          // Call optIn directly from the user's click so the browser can show its permission prompt.
          const optIn = oneSignalInstance.User.PushSubscription.optIn();
          await optIn;
          markWelcomeSeen();
          welcomeDialog.close();
          render();
        } catch (error) {
          feedback.textContent = 'Notifications could not be enabled right now. You can try again from your account menu.';
          button.disabled = false;
          console.warn('Welcome notification opt-in failed:', error.name || 'Error');
        }
      });
    }

    if (!welcomeDialog.open) welcomeDialog.showModal();
  }

  function withTimeout(promise, milliseconds, code) {
    let timer;
    return Promise.race([
      promise,
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(code)), milliseconds); })
    ]).finally(() => clearTimeout(timer));
  }

  function announce(message, visible = false) {
    status.textContent = message;
    status.hidden = !message || !visible;
  }

  function render() {
    if (sdkUnavailable) {
      toggle.disabled = notificationConfigMissing;
      toggle.textContent = notificationConfigMissing ? 'Notifications unavailable' : 'Retry notifications';
      announce(sdkUnavailableMessage || 'Notification service could not be loaded. Try again in a moment.', true);
      emailToggle.disabled = true;
      emailToggle.textContent = 'Email updates unavailable';
      emailStatus.textContent = 'Email updates are not configured for this site yet.';
      emailStatus.hidden = !emailSupported;
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
      toggle.disabled = false;
      toggle.textContent = 'Retry notifications';
      announce(settingsError, true);
      emailToggle.disabled = true;
      emailToggle.textContent = 'Email updates unavailable';
      emailStatus.textContent = settingsError;
      emailStatus.hidden = !emailSupported;
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
    emailToggle.hidden = !emailSupported;
    emailToggle.disabled = !emailSupported;
    emailToggle.textContent = emailEnabled ? 'Turn off email updates' : 'Turn on email updates';
    emailStatus.textContent = emailEnabled
      ? 'You will receive relevant club updates at your student account email.'
      : 'Email updates are off. Turn them on when you are ready.';
    emailStatus.hidden = !emailSupported;
    const supported = oneSignalInstance.Notifications.isPushSupported();
    const permissionDenied = typeof Notification !== 'undefined' && Notification.permission === 'denied';
    if (!supported) {
      toggle.disabled = true;
      toggle.textContent = 'Notifications unavailable';
      announce('This browser or device does not support web push notifications.', true);
      return;
    }
    const optedIn = Boolean(oneSignalInstance.User.PushSubscription.optedIn);
    toggle.disabled = permissionDenied;
    toggle.textContent = optedIn ? 'Turn off notifications' : permissionDenied ? 'Notifications blocked' : 'Turn on notifications';
    announce(permissionDenied
      ? 'Notifications are blocked in browser settings. Change this site’s permission there to enable them.'
      : optedIn ? 'You are subscribed to relevant club updates.' : 'Push notifications are off. You can turn them on when you are ready.',
    permissionDenied);
  }

  async function loadOneSignal() {
    if (initialization) return initialization;
    initialization = (async () => {
      const configResponse = await withTimeout(fetch('/api/notifications/config', {
        cache: 'no-store', siteStartupNonBlocking: true
      }), 10000, 'ONESIGNAL_CONFIG_TIMEOUT');
      if (!configResponse.ok) throw new Error(`NOTIFICATION_CONFIG_HTTP_${configResponse.status}`);
      const config = await configResponse.json();
      if (!config.enabled || !config.appId) {
        sdkUnavailable = true;
        notificationConfigMissing = true;
        sdkUnavailableMessage = 'Push notifications are not configured for this site yet.';
        render();
        return null;
      }
      notificationConfigMissing = false;

      window.OneSignalDeferred = window.OneSignalDeferred || [];
      let resolveSdk;
      let rejectSdk;
      let attemptActive = true;
      let script;
      let deferredHandler;
      const sdkReady = new Promise((resolve, reject) => { resolveSdk = resolve; rejectSdk = reject; });
      const removePendingInitialization = () => {
        attemptActive = false;
        if (Array.isArray(window.OneSignalDeferred) && deferredHandler) {
          const pendingIndex = window.OneSignalDeferred.indexOf(deferredHandler);
          if (pendingIndex !== -1) window.OneSignalDeferred.splice(pendingIndex, 1);
        }
        script?.remove();
      };
      deferredHandler = async (OneSignal) => {
        if (!attemptActive) return;
        try {
          await OneSignal.init({
            appId: config.appId,
            // Use an origin-root path so the same worker is found from nested dashboard URLs too.
            serviceWorkerPath: '/push/onesignal/OneSignalSDKWorker.js',
            serviceWorkerParam: { scope: '/push/onesignal/' },
            allowLocalhostAsSecureOrigin: ['localhost', '127.0.0.1'].includes(location.hostname)
          });
          resolveSdk(OneSignal);
        } catch (error) {
          rejectSdk(error);
        }
      };
      window.OneSignalDeferred.push(deferredHandler);

      script = document.createElement('script');
      script.src = 'https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js';
      script.async = true;
      script.onerror = () => rejectSdk(new Error('The OneSignal SDK could not be downloaded. Check the network or content blocker and retry.'));
      document.head.appendChild(script);
      try {
        oneSignalInstance = await withTimeout(sdkReady, 12000, 'ONESIGNAL_SDK_TIMEOUT');
      } catch (error) {
        removePendingInitialization();
        throw error;
      }
      attemptActive = false;
      oneSignalInstance.User.PushSubscription.addEventListener('change', render);
      oneSignalInstance.Notifications.addEventListener('permissionChange', render);
      render();
      return oneSignalInstance;
    })().catch((error) => {
      sdkUnavailableMessage = error.message === 'ONESIGNAL_SDK_TIMEOUT'
        ? 'OneSignal took too long to start. Check the connection and retry.'
        : (error.message || 'OneSignal could not start. Check the connection and retry.').slice(0, 220);
      console.warn('Push notifications are currently unavailable:', error.name || 'Error', error.message || '');
      sdkUnavailable = true;
      render();
      return null;
    });
    return initialization;
  }

  async function setSession(session) {
    currentSession = session;
    emailSupported = session?.type === 'student';
    emailToggle.hidden = !emailSupported;
    emailStatus.hidden = !emailSupported;
    const revision = ++sessionRevision;
    if (!session?.authenticated || !['student', 'club', 'admin'].includes(session.type)) {
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
        cache: 'no-store', credentials: 'same-origin', siteStartupNonBlocking: true
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
      emailSupported = identity.emailSupported !== false;
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
        maybeShowNotificationWelcome();
      }
    }
  }

  toggle.addEventListener('click', async () => {
    if (sdkUnavailable) {
      if (notificationConfigMissing) return;
      sdkUnavailable = false;
      sdkUnavailableMessage = '';
      initialization = null;
      await setSession(currentSession);
      return;
    }
    if (settingsError) {
      await setSession(currentSession);
      return;
    }
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
      if (outcomeMessage) announce(outcomeMessage, true);
    }
  });

  emailToggle.addEventListener('click', async () => {
    if (!emailSupported) return;
    emailToggle.disabled = true;
    emailStatus.textContent = 'Updating your email preference...';
    emailStatus.hidden = !emailSupported;
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
  async function prepareFirstVisitPrompt() {
    if (hasSeenWelcome()) return;
    try {
      let session = window.__miuAccountSession;
      if (!session) {
        const response = await fetch('/api/site/account-session', {
          cache: 'no-store', credentials: 'same-origin', siteStartupNonBlocking: true
        });
        if (response.ok) session = await response.json();
      }
      if (session) await setSession(session);
      const OneSignal = await loadOneSignal();
      if (OneSignal) maybeShowNotificationWelcome();
    } catch (error) {
      console.warn('First-visit notification prompt could not be prepared:', error.name || 'Error');
    }
  }

  if (window.__miuAccountSession) setSession(window.__miuAccountSession).catch(() => {});
  prepareFirstVisitPrompt();
})();
