const CACHE = 'ua-pwa-v5';

const SHELL = [
  './',
  './index.html',
  './manifest.json',
  './data/products.json',
  './images/site/header-banner.png',
  './images/site/site-bg.jpg',
  './icons/icon-32.png',
  './icons/icon-48.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => Promise.allSettled(SHELL.map((url) => cache.add(url))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(
        keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)),
      ))
      .then(() => self.clients.claim()),
  );
});

function put(request, response) {
  if (!response || (!response.ok && response.type !== 'opaque')) return Promise.resolve();
  return caches.open(CACHE).then((cache) => cache.put(request, response));
}

function networkFirst(request, fallbackUrl) {
  return fetch(request)
    .then((response) => {
      put(request, response.clone());
      return response;
    })
    .catch(() => caches
      .match(request)
      .then((cached) => cached
        || (fallbackUrl ? caches.match(fallbackUrl) : undefined)
        || Response.error()));
}

function cacheFirst(request) {
  return caches.match(request).then((cached) => cached || fetch(request)
    .then((response) => {
      put(request, response.clone());
      return response;
    }));
}

function staleWhileRevalidate(request) {
  return caches.match(request).then((cached) => {
    const network = fetch(request)
      .then((response) => {
        put(request, response.clone());
        return response;
      })
      .catch(() => cached);

    return cached || network;
  });
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;
  if (url.hostname === 't.me') return;

  // API и живые данные каталога кешировать нельзя: админ сохраняет правки.
  if (url.pathname.includes('/api/') || url.pathname.endsWith('/data/products.json')) {
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, './index.html'));
    return;
  }

  if (url.origin === self.location.origin) {
    if (url.pathname.endsWith('/data/products.json')) {
      event.respondWith(networkFirst(request, './data/products.json'));
      return;
    }

    if (
      url.pathname.includes('/assets/')
      || url.pathname.endsWith('.js')
      || url.pathname.endsWith('.css')
    ) {
      event.respondWith(cacheFirst(request));
      return;
    }
  }

  event.respondWith(staleWhileRevalidate(request));
});
