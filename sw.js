const SW_VERSION = '2026-02-24-3';
const STATIC_CACHE = `urzen-static-${SW_VERSION}`;
const RUNTIME_CACHE = `urzen-runtime-${SW_VERSION}`;
const CACHE_PREFIXES = ['urzen-static-', 'urzen-runtime-'];
const OFFLINE_URL = '/offline.html';

const PRECACHE_URLS = [
  '/',
  '/index.html',
  OFFLINE_URL,
  '/manifest.json',
  '/css/main.css',
  '/css/main.css?v=20260224-4',
  '/assets/icons/icon-192.png',
  '/assets/icons/icon-512.png',
  '/favicon.png'
];

function isCacheableResponse(response) {
  return Boolean(response) && response.ok && response.type === 'basic';
}

function isStaticAssetRequest(request, url) {
  if (request.method !== 'GET') return false;
  if (url.origin !== self.location.origin) return false;

  if (url.pathname.startsWith('/css/') || url.pathname.startsWith('/assets/') || url.pathname.startsWith('/ts/')) {
    return true;
  }

  return /\.(?:css|js|ts|png|jpe?g|svg|webp|gif|ico|woff2?)$/i.test(url.pathname);
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(STATIC_CACHE);
    await cache.addAll(PRECACHE_URLS.map((url) => new Request(url, { cache: 'reload' })));
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => {
      const shouldDelete = CACHE_PREFIXES.some((prefix) => key.startsWith(prefix))
        && key !== STATIC_CACHE
        && key !== RUNTIME_CACHE;
      return shouldDelete ? caches.delete(key) : Promise.resolve(false);
    }));

    await self.clients.claim();
  })());
});

async function handleNavigation(request) {
  try {
    const networkResponse = await fetch(request);
    if (isCacheableResponse(networkResponse)) {
      const cache = await caches.open(RUNTIME_CACHE);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    const cachedPage = await caches.match(request);
    if (cachedPage) return cachedPage;

    const cachedIndex = await caches.match('/index.html');
    if (cachedIndex) return cachedIndex;

    const offlineFallback = await caches.match(OFFLINE_URL);
    if (offlineFallback) return offlineFallback;

    return new Response('Offline', { status: 503, statusText: 'Offline' });
  }
}

async function handleStaticAsset(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cachedResponse = await cache.match(request);

  const networkPromise = fetch(request)
    .then((networkResponse) => {
      if (isCacheableResponse(networkResponse)) {
        cache.put(request, networkResponse.clone());
      }
      return networkResponse;
    })
    .catch(() => null);

  if (cachedResponse) {
    return cachedResponse;
  }

  const networkResponse = await networkPromise;
  if (networkResponse) return networkResponse;

  if (request.destination === 'image') {
    const fallbackImage = await caches.match('/assets/icons/icon-192.png');
    if (fallbackImage) return fallbackImage;
  }

  return new Response('Resource unavailable offline', { status: 503, statusText: 'Offline' });
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method !== 'GET') {
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(handleNavigation(request));
    return;
  }

  if (isStaticAssetRequest(request, url)) {
    event.respondWith(handleStaticAsset(request));
  }
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
