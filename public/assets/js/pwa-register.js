(() => {
  if (!/^https?:$/.test(location.protocol)) return;

  let notice;
  const showOfflineNotice = (message = 'You are offline. Changes cannot be saved; reconnect before submitting forms.') => {
    if (!notice) {
      notice = document.createElement('div');
      notice.setAttribute('role', 'status');
      notice.setAttribute('aria-live', 'polite');
      Object.assign(notice.style, {
        position: 'fixed', inset: '12px 12px auto', zIndex: '2147483647', margin: '0 auto',
        width: 'max-content', maxWidth: 'min(560px, calc(100vw - 24px))', padding: '12px 16px',
        borderRadius: '12px', background: '#172033', color: '#fff', boxShadow: '0 8px 28px #0003',
        font: '600 14px/1.45 system-ui, sans-serif', textAlign: 'center'
      });
      document.body.appendChild(notice);
    }
    notice.textContent = message;
    notice.hidden = false;
  };

  const hideOfflineNotice = () => { if (notice) notice.hidden = true; };
  window.addEventListener('offline', () => showOfflineNotice());
  window.addEventListener('online', hideOfflineNotice);
  if (!navigator.onLine) showOfflineNotice();

  // Track edits so refresh never silently discards a form in progress.
  const markFormDirty = (event) => {
    if (event.target instanceof HTMLElement && event.target.form) event.target.form.dataset.miuDirty = 'true';
  };
  document.addEventListener('input', markFormDirty, true);
  document.addEventListener('change', markFormDirty, true);

  async function refreshPage() {
    if (document.querySelector('form[data-miu-dirty="true"]')
      && !window.confirm('Refresh this page? Any unsaved form changes may be lost.')) return false;

    if ('serviceWorker' in navigator) {
      try {
        const registration = await navigator.serviceWorker.getRegistration('/');
        if (registration) {
          await Promise.race([
            registration.update().catch(() => {}),
            new Promise((resolve) => setTimeout(resolve, 1200))
          ]);
        }
      } catch (_) {
        // Reload still works when a service worker update check is unavailable.
      }
    }
    window.miuLiveData?.invalidate();
    await clearCachedPages();
    window.location.reload();
    return true;
  }
  window.miuRefreshPage = refreshPage;

  // Detect a new Vercel deployment even when sw.js itself did not change.
  // Only reload when the deployment marker changes, never on a timer.
  let deploymentVersion = '';
  let checkingDeployment = false;
  let versionPollTimer = 0;
  let refreshAfterDirtyForm = false;
  const hasDirtyForm = () => Boolean(document.querySelector('form[data-miu-dirty="true"]'));
  const clearCachedPages = async () => {
    const controller = navigator.serviceWorker?.controller;
    if (!controller || typeof MessageChannel === 'undefined') return;
    await new Promise((resolve) => {
      const channel = new MessageChannel();
      const timeout = setTimeout(resolve, 500);
      channel.port1.onmessage = () => { clearTimeout(timeout); resolve(); };
      controller.postMessage({ type: 'MIU_CLEAR_CACHED_PAGES' }, [channel.port2]);
    });
  };
  const checkDeploymentVersion = async () => {
    if (checkingDeployment || !navigator.onLine || document.visibilityState === 'hidden') return;
    checkingDeployment = true;
    try {
      const response = await fetch(`/api/pwa/version?_=${Date.now()}`, {
        cache: 'no-store', credentials: 'same-origin', headers: { Accept: 'application/json' }
      });
      if (!response.ok) return;
      const payload = await response.json();
      if (typeof payload.version !== 'string' || !payload.version) return;
      if (!deploymentVersion) {
        deploymentVersion = payload.version;
        return;
      }
      if (deploymentVersion === payload.version) return;
      if (hasDirtyForm()) {
        refreshAfterDirtyForm = true;
        return;
      }
      await clearCachedPages();
      deploymentVersion = payload.version;
      window.location.reload();
    } catch {
      // The site remains usable if the deployment check is temporarily unavailable.
    } finally {
      checkingDeployment = false;
    }
  };
  const scheduleVersionCheck = () => {
    clearTimeout(versionPollTimer);
    if (document.visibilityState === 'hidden') return;
    versionPollTimer = setTimeout(async () => {
      await checkDeploymentVersion();
      scheduleVersionCheck();
    }, 60000);
  };
  const initialVersionCheck = () => {
    void checkDeploymentVersion();
    scheduleVersionCheck();
  };
  window.addEventListener('load', initialVersionCheck, { once: true });
  window.addEventListener('focus', () => {
    void checkDeploymentVersion();
    scheduleVersionCheck();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      void checkDeploymentVersion();
      scheduleVersionCheck();
    } else {
      clearTimeout(versionPollTimer);
    }
  });
  window.addEventListener('online', () => void checkDeploymentVersion());

  // Native browsers usually provide pull-to-refresh; this adds the same gesture
  // to installed PWAs and provides a consistent indicator on touch devices.
  if (window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window) {
    const indicator = document.createElement('div');
    indicator.className = 'pwa-refresh-indicator';
    indicator.setAttribute('role', 'status');
    indicator.setAttribute('aria-live', 'polite');
    indicator.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 7v5h-5"/><path d="M4.9 9a8 8 0 0 1 13.2-2L20 12M4 17v-5h5"/><path d="M19.1 15a8 8 0 0 1-13.2 2L4 12"/></svg><span>Pull to refresh</span>';
    document.body.appendChild(indicator);

    let startX = 0;
    let startY = 0;
    let pullDistance = 0;
    let trackingPull = false;
    let refreshing = false;
    const resetPull = () => {
      trackingPull = false;
      pullDistance = 0;
      indicator.classList.remove('is-active', 'is-refreshing');
      indicator.style.setProperty('--pull-distance', '0px');
      indicator.querySelector('span').textContent = 'Pull to refresh';
    };

    document.addEventListener('touchstart', (event) => {
      if (refreshing || event.touches.length !== 1 || window.scrollY > 1) return;
      if (event.target.closest('.mobile-dashboard-drawer, a, button, input, select, textarea, [contenteditable="true"], [data-no-pull-refresh]')) return;
      startX = event.touches[0].clientX;
      startY = event.touches[0].clientY;
      trackingPull = true;
    }, { passive: true });

    document.addEventListener('touchmove', (event) => {
      if (!trackingPull || event.touches.length !== 1) return;
      const deltaX = event.touches[0].clientX - startX;
      const deltaY = event.touches[0].clientY - startY;
      if (Math.abs(deltaX) > Math.abs(deltaY) || deltaY < 0 || window.scrollY > 1) {
        resetPull();
        return;
      }
      pullDistance = deltaY;
      if (pullDistance < 5) return;
      event.preventDefault();
      indicator.classList.add('is-active');
      indicator.style.setProperty('--pull-distance', `${Math.min(42 + pullDistance * 0.55, 105)}px`);
      indicator.querySelector('span').textContent = pullDistance >= 78 ? 'Release to refresh' : 'Pull to refresh';
    }, { passive: false });

    document.addEventListener('touchend', async () => {
      if (!trackingPull) return;
      const shouldRefresh = pullDistance >= 78;
      trackingPull = false;
      if (!shouldRefresh) { resetPull(); return; }
      refreshing = true;
      indicator.classList.add('is-active', 'is-refreshing');
      indicator.querySelector('span').textContent = 'Refreshing...';
      const didRefresh = await refreshPage();
      if (!didRefresh) {
        refreshing = false;
        resetPull();
      }
    }, { passive: true });
    document.addEventListener('touchcancel', resetPull, { passive: true });
  }

  // Prevent forms from appearing to submit while no server connection exists.
  document.addEventListener('submit', (event) => {
    if (navigator.onLine) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    showOfflineNotice('Not sent: you are offline. Reconnect, then submit the form again.');
  }, true);

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      const isLocalDevelopment = ['localhost', '127.0.0.1', '::1'].includes(location.hostname);
      if (isLocalDevelopment) {
        Promise.all([
          navigator.serviceWorker.getRegistrations().then((registrations) => Promise.all(
            registrations.filter((registration) => new URL(registration.scope).pathname === '/')
              .map((registration) => registration.unregister())
          )),
          caches.keys().then((names) => Promise.all(names
            .filter((name) => name.startsWith('miu-clubs-static-'))
            .map((name) => caches.delete(name))))
        ]).catch(() => {});
        return;
      }
      navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).catch((error) => {
        console.warn('PWA service worker registration failed:', error);
      });
    }, { once: true });
  }
})();
