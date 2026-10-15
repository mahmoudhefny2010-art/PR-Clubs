const CACHE_NAME = 'miu-clubs-static-v15';
const OFFLINE_URL = '/offline.html';
const MAIN_PAGES = ['/', '/index.html', '/pages/feed.html', '/pages/events.html', '/pages/sponsors.html', '/pages/booths.html'];
const PRECACHE_URLS = [
  ...MAIN_PAGES.filter(url => url !== '/index.html'),
  '/components/site-header.html?v=20261014accountphoto2',
  '/components/site-footer.html',
  OFFLINE_URL,
  '/manifest.webmanifest',
  '/assets/css/base.css',
  '/assets/css/responsive.css',
  '/assets/css/dark.css',
  '/assets/css/features.css',
  '/assets/js/site-loading.js',
  '/assets/js/theme.js',
  '/assets/img/pics/pwa-icon-192.png',
  '/assets/img/pics/pwa-icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    const queue = [...PRECACHE_URLS];
    const seen = new Set(queue);
    const preload = async () => {
      while (queue.length) {
        const url = queue.shift();
        try {
          const response = await fetch(url, { cache: 'no-cache' });
          if (!isCacheablePublicResponse(response) || response.redirected) continue;
          // Warm the exact versioned scripts and styles referenced by each page.
          if (MAIN_PAGES.includes(url)) {
            const html = await response.clone().text();
            for (const match of html.matchAll(/(?:src|href)=["']([^"']+)["']/g)) {
              const asset = new URL(match[1], self.location.origin);
              if (isRevalidatedCodeAsset(asset) && !seen.has(asset.pathname + asset.search)) {
                seen.add(asset.pathname + asset.search);
                queue.push(asset.pathname + asset.search);
              }
            }
          }
          await cache.put(url === '/' ? '/index.html' : url, response.clone());
          if (url === '/') await cache.put('/', response);
        } catch {
          // A missing optional asset should not prevent installation.
        }
      }
    };
    await Promise.all([preload(), preload(), preload()]);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    const previousNames = names.filter((name) => name.startsWith('miu-clubs-static-') && name !== CACHE_NAME);
    for (const name of previousNames) {
      await caches.delete(name);
    }
    await self.clients.claim();
  })());
});

function isRevalidatedCodeAsset(url) {
  return url.origin === self.location.origin
    && (url.pathname.startsWith('/assets/') || url.pathname === '/manifest.webmanifest')
    && /\.(?:css|js|mjs|json|webmanifest)$/i.test(url.pathname);
}

function isCacheableStaticAsset(url) {
  return url.origin === self.location.origin
    && url.pathname.startsWith('/assets/')
    && /\.(?:png|jpe?g|webp|gif|svg|ico|woff2?|ttf|otf|avif)$/i.test(url.pathname);
}

async function reuseAndRefresh(request, event, page = false) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  const refresh = (async () => {
    const response = await fetch(request, { cache: 'no-cache' });
    if ((page ? isCacheablePublicPage(response) : isCacheablePublicResponse(response)) && !response.redirected) {
      await cache.put(request, response.clone());
    } else await cache.delete(request);
    return response;
  })();
  // Explicit browser reloads bypass the saved copy.
  if (cached && request.cache !== 'reload' && request.cache !== 'no-cache') {
    event.waitUntil(refresh.catch(() => {}));
    return cached;
  }
  try { return await refresh; }
  catch { return cached || (page && await cache.match(OFFLINE_URL)) || Response.error(); }
}

function isCacheablePublicResponse(response) {
  if (!response.ok || response.type !== 'basic') return false;
  const cacheControl = response.headers.get('Cache-Control') || '';
  return !/(?:^|,)\s*(?:no-store|private)\b/i.test(cacheControl);
}

function isCacheablePublicPage(response) {
  if (!response.ok || response.type !== 'basic') return false;
  if (!/text\/html/i.test(response.headers.get('Content-Type') || '')) return false;
  const cacheControl = response.headers.get('Cache-Control') || '';
  return !/(?:^|,)\s*(?:no-store|private)\b/i.test(cacheControl);
}

self.addEventListener('message', (event) => {
  if (event.data?.type !== 'MIU_CLEAR_CACHED_PAGES') return;
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    for (const request of await cache.keys()) {
      const url = new URL(request.url);
      if (MAIN_PAGES.includes(url.pathname) || url.pathname.startsWith('/components/') || isRevalidatedCodeAsset(url)) await cache.delete(request);
    }
    event.ports?.[0]?.postMessage({ cleared: true });
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  // Only these public shells are reused. APIs, forms and account dashboards
  // continue to use the network and their existing authentication checks.
  if (request.mode === 'navigate') {
    if (MAIN_PAGES.includes(url.pathname) && !url.search) event.respondWith(reuseAndRefresh(request, event, true));
    return;
  }

  if (url.pathname.startsWith('/api/')) return;
  if (isRevalidatedCodeAsset(url)) {
    if (request.mode === 'navigate') return;
    event.respondWith(reuseAndRefresh(request, event));
    return;
  }

  if (isCacheableStaticAsset(url)) {
    event.respondWith(reuseAndRefresh(request, event));
    return;
  }
  // Shared public header/footer are reused just like the page shell.
  if (url.pathname.startsWith('/components/')) {
    event.respondWith(reuseAndRefresh(request, event));
  }
});


