(() => {
  const root = document.documentElement;
  // Let the browser restore scroll once. A second delayed restoration caused
  // visible jumps while dynamic page content was still settling.
  if ('scrollRestoration' in window.history) window.history.scrollRestoration = 'auto';
  let scrollResetFrame = 0;
  window.resetPageScroll = () => {
    window.cancelAnimationFrame(scrollResetFrame);
    // Override the site's smooth scrolling when opening a page or app view.
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    scrollResetFrame = window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    });
  };
  const nativeFetch = window.fetch.bind(window);
  let pendingRequests = 0;
  let domReady = document.readyState !== 'loading';
  let revealTimer = 0;
  let startupReleaseTimer = 0;
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
    if (!domReady || pendingRequests > 0 || startupReleased) return;
    // Give chained startup requests (for example session -> dashboard data) time to begin.
    startupReleaseTimer = window.setTimeout(() => {
      // Allow JSON consumers and their DOM updates to paint before uncovering
      // the page. Recheck because a chained request may have started meanwhile.
      window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
        if (domReady && pendingRequests === 0) releaseStartupScreen();
      }));
    }, 180);
  }

  document.addEventListener('DOMContentLoaded', () => {
    domReady = true;
    ensureIndicators();
    releaseWhenReady();
  }, { once: true });
  if (domReady) {
    releaseWhenReady();
  }
  // Keep the branded cover visible until the document and its tracked startup
  // requests have finished. Slow startup data must never reveal an empty page.

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
    if (!startupCover) {
      startupCover = document.createElement('div');
      startupCover.className = 'site-startup-cover';
      startupCover.setAttribute('aria-hidden', 'true');
      document.body.append(startupCover);
    }
    if (!startupRing) {
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
    window.clearTimeout(startupReleaseTimer);
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
    afterStartup: scheduleAfterStartup
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
