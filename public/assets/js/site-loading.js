(() => {
  const root = document.documentElement;
  const navigationEntry = window.performance?.getEntriesByType?.('navigation')?.[0];
  const isPageReload = navigationEntry?.type === 'reload' || (!navigationEntry && window.performance?.navigation?.type === 1);
  // A newly loaded document always starts at the top, including links that
  // carry a fragment. Hash changes made after load still navigate in-page.
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
  const scrollPositionKey = `miu-scroll-position:${window.location.pathname}${window.location.search}${window.location.hash}`;
  let scrollSaveTimer = 0;
  const saveScrollPosition = () => {
    try { sessionStorage.setItem(scrollPositionKey, JSON.stringify({ x: window.scrollX, y: window.scrollY })); } catch {}
  };
  window.addEventListener('scroll', () => {
    window.clearTimeout(scrollSaveTimer);
    scrollSaveTimer = window.setTimeout(saveScrollPosition, 80);
  }, { passive: true });
  window.addEventListener('pagehide', saveScrollPosition);
  window.addEventListener('load', () => {
    if (!isPageReload) return;
    let saved;
    try { saved = JSON.parse(sessionStorage.getItem(scrollPositionKey) || 'null'); } catch { saved = null; }
    if (!saved || !Number.isFinite(saved.y)) return;
    // App views may finish restoring after load; restore once they have rendered.
    window.setTimeout(() => window.scrollTo({ left: saved.x || 0, top: saved.y, behavior: 'instant' }), 700);
  }, { once: true });
  const nativeFetch = window.fetch.bind(window);
  let pendingRequests = 0;
  let pendingInitialRequests = 0;
  let domReady = document.readyState !== 'loading';
  let pageLoaded = document.readyState === 'complete';
  let revealTimer = 0;
  let screen = null;
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
    if (screen && indicator) return true;

    screen = document.createElement('div');
    screen.className = 'site-loading-screen';
    screen.setAttribute('role', 'status');
    screen.setAttribute('aria-live', 'polite');
    screen.innerHTML = '<div class="site-loading-card"><span class="site-loading-logo"><img src="/assets/img/pics/logo.svg.png" alt="" /></span><span class="site-loading-title">MIU Clubs</span><span class="site-loading-caption">Getting things ready</span><span class="site-loading-track" aria-hidden="true"></span></div>';

    indicator = document.createElement('div');
    indicator.className = 'site-loading-indicator';
    indicator.setAttribute('role', 'status');
    indicator.setAttribute('aria-live', 'polite');
    indicator.innerHTML = '<span class="site-loading-mini-logo"><img src="/assets/img/pics/logo.svg.png" alt="" /></span><span>Loading MIU Clubs</span>';
    document.body.append(screen, indicator);
    return true;
  }

  function updateIndicators() {
    if (!ensureIndicators()) return;
    screen.classList.toggle('is-visible', pendingInitialRequests > 0);
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
      else if (screen && indicator) {
        screen.classList.remove('is-visible');
        indicator.classList.remove('is-visible');
      }
    });
  };

  window.addEventListener('load', () => {
    pageLoaded = true;
    domReady = true;
    if (!pendingRequests && screen && indicator) {
      screen.classList.remove('is-visible');
      indicator.classList.remove('is-visible');
    }
    updateStartupScreen();
  }, { once: true });
})();
