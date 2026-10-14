const CACHE_NAME = 'miu-clubs-static-v11';
const OFFLINE_URL = '/offline.html';
const PRECACHE_URLS = [
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
    await Promise.all(PRECACHE_URLS.map(async (url) => {
      try {
        const response = await fetch(url, { cache: 'no-cache' });
        if (response.ok && response.type === 'basic') await cache.put(url, response);
      } catch {
        // A missing optional asset should not prevent installation.
      }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    const cache = await caches.open(CACHE_NAME);
    const previousNames = names.filter((name) => name.startsWith('miu-clubs-static-') && name !== CACHE_NAME);
    for (const name of previousNames) {
      const previous = await caches.open(name);
      for (const request of await previous.keys()) {
        if (!await cache.match(request)) {
          const response = await previous.match(request);
          if (response) await cache.put(request, response);
        }
      }
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

async function cachedStatic(request) {
  return fetchThenCache(request);
}

function isCacheablePublicResponse(response) {
  if (!response.ok || response.type !== 'basic') return false;
  const cacheControl = response.headers.get('Cache-Control') || '';
  return !/(?:^|,)\s*(?:no-store|private)\b/i.test(cacheControl);
}

async function fetchThenCache(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request, { cache: 'no-cache' });
    if (isCacheablePublicResponse(response)) await cache.put(request, response.clone());
    return response;
  } catch (error) {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw error;
  }
}

function isCacheablePublicPage(response) {
  if (!response.ok || response.type !== 'basic') return false;
  if (!/text\/html/i.test(response.headers.get('Content-Type') || '')) return false;
  const cacheControl = response.headers.get('Cache-Control') || '';
  return !/(?:^|,)\s*(?:no-store|private)\b/i.test(cacheControl);
}

async function cachedPublicPage(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request, { cache: 'no-cache' });
    if (isCacheablePublicPage(response)) await cache.put(request, response.clone());
    else if (response.status === 200) await cache.delete(request);
    return response;
  } catch {
    return (await cache.match(request)) || (await cache.match(OFFLINE_URL)) || Response.error();
  }
}

self.addEventListener('message', (event) => {
  if (event.data?.type !== 'MIU_CLEAR_CACHED_PAGES') return;
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    for (const request of await cache.keys()) {
      if (request.headers.get('Accept')?.includes('text/html')) await cache.delete(request);
    }
    event.ports?.[0]?.postMessage({ cleared: true });
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  // Cache only public HTML. Responses marked private/no-store (including gated
  // dashboards) remain network-only; API and authentication requests are never cached.
  if (request.mode === 'navigate') {
    event.respondWith(cachedPublicPage(request, event));
    return;
  }

  if (url.pathname.startsWith('/api/')) return;
  if (isRevalidatedCodeAsset(url)) {
    if (request.mode === 'navigate') return;
    event.respondWith(fetchThenCache(request));
    return;
  }

  if (isCacheableStaticAsset(url)) {
    event.respondWith(cachedStatic(request));
    return;
  }
  // Dynamically injected public HTML fragments also need to be current on
  // every online visit; retain a copy only for offline fallback.
  if (url.pathname.startsWith('/components/')) {
    event.respondWith(fetchThenCache(request));
  }
});


