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
  let startupReleased = false;

  root.classList.add('site-startup-pending');

  function releaseStartupScreen() {
    if (startupReleased) return;
    startupReleased = true;
    window.clearTimeout(startupReleaseTimer);
    root.classList.remove('site-startup-pending');
  }

  function releaseWhenReady() {
    window.clearTimeout(startupReleaseTimer);
    if (!domReady || pendingRequests > 0 || startupReleased) return;
    // Give chained startup requests (for example session -> dashboard data) time to begin.
    startupReleaseTimer = window.setTimeout(() => {
      if (domReady && pendingRequests === 0) releaseStartupScreen();
    }, 180);
  }

  document.addEventListener('DOMContentLoaded', () => {
    domReady = true;
    ensureIndicators();
    releaseWhenReady();
  }, { once: true });
  if (domReady) releaseWhenReady();

  function requestNeedsIndicator(input) {
    try {
      const source = input instanceof Request ? input.url : input;
      const url = new URL(source, window.location.href);
      if (url.origin !== window.location.origin || !url.pathname.startsWith('/api/')) return false;
      return !url.pathname.endsWith('/visitor-ping') && !url.pathname.endsWith('/view');
    } catch {
      return false;
    }
  }

  function ensureIndicators() {
    if (!document.body) return false;
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

  window.fetch = function trackedFetch(input, init) {
    if (!requestNeedsIndicator(input)) return nativeFetch(input, init);
    pendingRequests += 1;
    window.clearTimeout(startupReleaseTimer);
    window.clearTimeout(revealTimer);
    revealTimer = window.setTimeout(updateIndicators, 160);

    return nativeFetch(input, init).finally(() => {
      pendingRequests = Math.max(0, pendingRequests - 1);
      window.clearTimeout(revealTimer);
      if (pendingRequests) updateIndicators();
      else if (indicator) indicator.classList.remove('is-visible');
      releaseWhenReady();
    });
  };
})();
