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
  let pendingInitialRequests = 0;
  let domReady = document.readyState !== 'loading';
  let pageLoaded = document.readyState === 'complete';
  let revealTimer = 0;
  let indicator = null;

  root.classList.add('site-startup-pending');

  function updateStartupScreen() {
    root.classList.toggle('site-startup-pending', !domReady || pendingInitialRequests > 0);
  }

  document.addEventListener('DOMContentLoaded', () => {
    domReady = true;
    window.setTimeout(updateStartupScreen, 0);
  }, { once: true });

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
    // The startup pseudo-element already covers initial requests. Keep one
    // full-screen layer instead of stacking a second blurred loader over it.
    indicator.classList.toggle('is-visible', pendingRequests > 0 && pendingInitialRequests === 0);
    updateStartupScreen();
  }

  window.fetch = function trackedFetch(input, init) {
    if (!requestNeedsIndicator(input)) return nativeFetch(input, init);
    const isInitialRequest = !pageLoaded;
    pendingRequests += 1;
    if (isInitialRequest) pendingInitialRequests += 1;
    window.clearTimeout(revealTimer);
    if (isInitialRequest) updateIndicators();
    else revealTimer = window.setTimeout(updateIndicators, 160);

    return nativeFetch(input, init).finally(() => {
      pendingRequests = Math.max(0, pendingRequests - 1);
      if (isInitialRequest) pendingInitialRequests = Math.max(0, pendingInitialRequests - 1);
      window.clearTimeout(revealTimer);
      updateStartupScreen();
      if (pendingRequests) updateIndicators();
      else if (indicator) {
        indicator.classList.remove('is-visible');
      }
    });
  };

  window.addEventListener('load', () => {
    pageLoaded = true;
    domReady = true;
    if (!pendingRequests && indicator) {
      indicator.classList.remove('is-visible');
    }
    updateStartupScreen();
  }, { once: true });
})();
