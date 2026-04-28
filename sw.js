/* eslint-disable no-restricted-globals */
/* Improved service worker with runtime caching and offline fallback
  - Cache static shell (index.html, manifest, todos.json, favicon)
  - Network-first for API (/todos), with cache fallback
  - Cache-first for static assets
  - Provides an offline fallback page for navigation
  - Supports skipWaiting via postMessage
*/

const CACHE_VERSION = 'v2';
const STATIC_CACHE = `etridebelt-static-${CACHE_VERSION}`;
const API_CACHE = `etridebelt-api-${CACHE_VERSION}`;
const RUNTIME_CACHE = `etridebelt-runtime-${CACHE_VERSION}`;

const STATIC_FILES = [
  '/',
  '/index.html',
  '/offline.html',
  '/todos.json',
  '/manifest.json',
  '/favicon.svg'
];

/* global self:readonly */

const sw = typeof self !== 'undefined' ? self : this;

sw.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(STATIC_FILES))
      .then(() => sw.skipWaiting())
  );
});

sw.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((k) => ![STATIC_CACHE, API_CACHE, RUNTIME_CACHE].includes(k))
        .map((k) => caches.delete(k))
    )).then(() => sw.clients.claim())
  );
});

// utility: network fetch with timeout
function fetchWithTimeout(request, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), timeout);
    fetch(request).then((res) => {
      clearTimeout(timer);
      resolve(res);
    }).catch((err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

sw.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Security: Only handle GET requests for caching. 
  // This prevents state-changing requests (POST, PUT, DELETE) from being cached.
  if (request.method !== 'GET') {
    return;
  }

  // API requests to /todos -> network-first, fallback to cache
  if (url.pathname.startsWith('/todos')) {
    event.respondWith(
      fetchWithTimeout(request, 4000)
        .then((networkResponse) => {
          // clone and put in cache
          const clone = networkResponse.clone();
          caches.open(API_CACHE).then((cache) => cache.put(request, clone));
          return networkResponse;
        })
        .catch(() => caches.match(request).then((cached) => cached || new Response(JSON.stringify([]), { headers: { 'Content-Type': 'application/json' } })))
    );
    return;
  }

  // Navigation requests (SPA) -> try network then cache then offline fallback
  if (request.mode === 'navigate' || (request.method === 'GET' && request.headers.get('accept') && request.headers.get('accept').includes('text/html'))) {
    event.respondWith(
      fetch(request).then((response) => {
        // put a copy in runtime cache
        const copy = response.clone();
        caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, copy));
        return response;
      }).catch(() => caches.match('/index.html').then((cached) => cached || caches.match('/offline.html')))
    );
    return;
  }

  // For same-origin static assets -> cache-first
  if (request.method === 'GET' && url.origin === location.origin) {
    event.respondWith(
      caches.match(request).then((cached) => cached || fetch(request).then((resp) => {
        // store in runtime cache
        const respClone = resp.clone();
        caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, respClone));
        return resp;
      }).catch(() => {
        // as a last resort return index.html for navigations handled above, otherwise nothing
        return cached;
      }))
    );
    return;
  }

  // Default: let the network handle it
});

sw.addEventListener('message', (event) => {
  if (!event.data) return;
  if (event.data.type === 'SKIP_WAITING') {
    sw.skipWaiting();
  }
});
