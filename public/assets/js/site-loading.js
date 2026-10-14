(() => {
  const prompts = [];
  const promptKeys = new Set();
  let promptTimer;
  const schedulePrompt = () => {
    clearTimeout(promptTimer);
    promptTimer = setTimeout(openNextPrompt, 350);
  };
  const openNextPrompt = () => {
    if (!prompts.length || document.visibilityState !== 'visible'
      || document.documentElement.classList.contains('site-startup-pending')
      || document.querySelector('dialog[open], .modal:not(.hidden), .calendar-modal:not(.hidden), .modal.show, .modal.is-open')) return;
    const next = prompts.shift();
    if (next.eligible && !next.eligible()) {
      promptKeys.delete(next.key);
      schedulePrompt();
      return;
    }
    next.dialog.addEventListener('close', () => {
      promptKeys.delete(next.key);
      schedulePrompt();
    }, { once: true });
    next.dialog.showModal();
    next.onOpen?.();
  };
  window.queueSitePrompt = (key, dialog, { eligible, onOpen } = {}) => {
    if (promptKeys.has(key) || dialog.open) return;
    promptKeys.add(key);
    prompts.push({ key, dialog, eligible, onOpen });
    schedulePrompt();
  };
  new MutationObserver(schedulePrompt).observe(document.documentElement, {
    subtree: true, childList: true, attributes: true, attributeFilter: ['open', 'class', 'hidden']
  });
  document.addEventListener('visibilitychange', schedulePrompt);
  document.addEventListener('close', schedulePrompt, true);

  const root = document.documentElement;
  // New documents and fresh in-page views always start at the top. Handle
  // Back/Forward separately so the browser can restore its own saved position.
  if ('scrollRestoration' in window.history) window.history.scrollRestoration = 'manual';
  let scrollResetFrame = 0;
  window.resetPageScroll = () => {
    window.cancelAnimationFrame(scrollResetFrame);
    // Override the site's smooth scrolling when opening a page or app view.
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    scrollResetFrame = window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    });
  };
  const navigationEntry = performance.getEntriesByType('navigation')[0];
  const isReload = navigationEntry?.type === 'reload';
  const isHistoryTraversal = navigationEntry?.type === 'back_forward';
  const hasPageAnchor = Boolean(location.hash && document.getElementById(decodeURIComponent(location.hash.slice(1))));
  // A true reload keeps its last position. Links to a section and browser
  // history traversal also retain their intended target/position.
  if (!isReload && !isHistoryTraversal && !hasPageAnchor) {
    window.resetPageScroll();
    window.addEventListener('pageshow', event => {
      if (!event.persisted) window.resetPageScroll();
    }, { once: true });
  }
  const nativeFetch = window.fetch.bind(window);
  let pendingRequests = 0;
  let domReady = document.readyState !== 'loading';
  let revealTimer = 0;
  let startupReleaseTimer = 0;
  let startupDeadlineTimer = 0;
  let indicator = null;
  let startupRing = null;
  let startupCover = null;
  let startupReleased = false;
  const afterStartupQueue = [];
  let activeAfterStartupTasks = 0;
  const MAX_BACKGROUND_TASKS = 4;

  root.classList.add('site-startup-pending');

  function releaseStartupScreen() {
    if (startupReleased) return;
    startupReleased = true;
    window.clearTimeout(startupReleaseTimer);
    window.clearTimeout(startupDeadlineTimer);
    root.classList.remove('site-startup-pending');
    startupCover?.remove();
    startupCover = null;
    runNextAfterStartupTask();
  }

  function scheduleAfterStartup(task) {
    if (typeof task !== 'function') return;
    afterStartupQueue.push(task);
    if (startupReleased) runNextAfterStartupTask();
  }

  function runNextAfterStartupTask() {
    if (!startupReleased || activeAfterStartupTasks >= MAX_BACKGROUND_TASKS || !afterStartupQueue.length) return;
    activeAfterStartupTasks += 1;
    const task = afterStartupQueue.shift();
    const run = async () => {
      try { await task(); } catch (error) { console.warn('Background page data could not be preloaded.', error); }
      activeAfterStartupTasks = Math.max(0, activeAfterStartupTasks - 1);
      if (afterStartupQueue.length) window.setTimeout(runNextAfterStartupTask, 80);
    };
    if ('requestIdleCallback' in window) window.requestIdleCallback(() => run(), { timeout: 900 });
    else window.setTimeout(run, 120);
    if (afterStartupQueue.length && activeAfterStartupTasks < MAX_BACKGROUND_TASKS) window.setTimeout(runNextAfterStartupTask, 80);
  }

  function releaseWhenReady() {
    window.clearTimeout(startupReleaseTimer);
    if (!domReady || startupReleased) return;
    // Reveal the page after its first paint; API work continues behind it and
    // is reported by the small loading indicator instead of blocking the view.
    startupReleaseTimer = window.setTimeout(() => {
      window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
        if (domReady) releaseStartupScreen();
      }));
    }, 180);
  }

  function armStartupDeadline() {
    if (startupReleased || startupDeadlineTimer) return;
    // Data can continue loading with the small indicator. Never block the
    // whole document indefinitely on a slow or stalled API.
    startupDeadlineTimer = window.setTimeout(releaseStartupScreen, 1500);
  }

  document.addEventListener('DOMContentLoaded', () => {
    domReady = true;
    ensureIndicators();
    armStartupDeadline();
    releaseWhenReady();
  }, { once: true });
  if (domReady) {
    armStartupDeadline();
    releaseWhenReady();
  }
  // Authentication views keep their own session gate after the cover releases.

  function requestNeedsIndicator(input) {
    try {
      const source = input instanceof Request ? input.url : input;
      const url = new URL(source, window.location.href);
      if (url.origin !== window.location.origin) return false;
      if (['/components/site-header.html', '/components/site-footer.html'].includes(url.pathname)) return true;
      if (!url.pathname.startsWith('/api/')) return false;
      return !url.pathname.endsWith('/visitor-ping') && !url.pathname.endsWith('/view')
        && url.pathname !== '/api/pwa/version';
    } catch {
      return false;
    }
  }

  function ensureIndicators() {
    if (!document.body) return false;
    if (!startupReleased && !startupCover) {
      startupCover = document.createElement('div');
      startupCover.className = 'site-startup-cover';
      startupCover.setAttribute('aria-hidden', 'true');
      document.body.append(startupCover);
    }
    if (!startupReleased && !startupRing) {
      startupRing = document.createElement('span');
      startupRing.className = 'site-startup-ring';
      startupRing.setAttribute('aria-hidden', 'true');
      document.body.append(startupRing);
    }
    if (indicator) return true;

    indicator = document.createElement('div');
    indicator.className = 'site-loading-indicator';
    indicator.setAttribute('role', 'status');
    indicator.setAttribute('aria-live', 'polite');
    indicator.innerHTML = '<span class="site-loading-mini-logo"><img src="/assets/img/pics/logo.svg.png" alt="" /></span><span>Loading MIU Clubs</span>';
    document.body.append(indicator);
    return true;
  }

  function updateIndicators() {
    if (!ensureIndicators()) return;
    indicator.classList.toggle('is-visible', pendingRequests > 0);
  }

  function trackWork(work) {
    pendingRequests += 1;
    window.clearTimeout(revealTimer);
    revealTimer = window.setTimeout(updateIndicators, 160);

    let operation;
    try { operation = work(); } catch (error) { operation = Promise.reject(error); }
    return Promise.resolve(operation).finally(() => {
      pendingRequests = Math.max(0, pendingRequests - 1);
      window.clearTimeout(revealTimer);
      if (pendingRequests) updateIndicators();
      else if (indicator) indicator.classList.remove('is-visible');
      releaseWhenReady();
    });
  }

  // Pages with asynchronous rendering can hold startup until their whole task
  // completes, rather than only until HTTP headers arrive.
  window.siteStartup = {
    track: (task) => trackWork(() => task),
    afterStartup: scheduleAfterStartup,
    watch: (task) => window.miuLiveData?.watch(task)
  };

  window.fetch = function trackedFetch(input, init) {
    if (init?.siteStartupNonBlocking === true) {
      const { siteStartupNonBlocking: _ignored, ...fetchOptions } = init;
      return nativeFetch(input, fetchOptions);
    }
    if (!requestNeedsIndicator(input)) return nativeFetch(input, init);
    return trackWork(async () => {
      const response = await nativeFetch(input, init);
      // fetch resolves at headers; JSON may still be downloading/parsing.
      // Track consumption without cloning or downloading the payload twice.
      for (const method of ['json', 'text', 'blob', 'arrayBuffer', 'formData']) {
        if (typeof response[method] !== 'function') continue;
        const consume = response[method].bind(response);
        response[method] = (...args) => trackWork(() => consume(...args));
      }
      return response;
    });
  };
})();
