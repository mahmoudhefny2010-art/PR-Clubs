const CACHE_NAME = 'miu-clubs-static-v5';
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
    await Promise.all(names.filter((name) => name.startsWith('miu-clubs-static-') && name !== CACHE_NAME)
      .map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

function isCacheableStaticAsset(url) {
  return url.origin === self.location.origin
    && (url.pathname.startsWith('/assets/') || url.pathname === '/manifest.webmanifest')
    && /\.(?:css|js|png|jpe?g|webp|gif|svg|ico|woff2?|ttf|otf|webmanifest)$/i.test(url.pathname);
}

async function networkFirstStatic(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request, { cache: 'no-cache' });
    if (response.ok && response.type === 'basic') await cache.put(request, response.clone());
    return response;
  } catch {
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;
    throw new Error('Static asset unavailable offline');
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  // Navigations always contact the server. If unavailable, show a clear offline page.
  // API responses, authentication, and HTML documents are never put in Cache Storage.
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(async () => {
      const cache = await caches.open(CACHE_NAME);
      return (await cache.match(OFFLINE_URL)) || Response.error();
    }));
    return;
  }

  if (url.pathname.startsWith('/api/') || !isCacheableStaticAsset(url)) return;
  event.respondWith(networkFirstStatic(request));
});


