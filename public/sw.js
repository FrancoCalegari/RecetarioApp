/* ═══════════════════════════════════════════════════════════════════
   RecetarioApp Service Worker
   v2 — Versioned cache + update notifications + Background Sync
   ═══════════════════════════════════════════════════════════════════ */

const CACHE_VERSION = 'v3';
const CACHE_NAME = `recetario-${CACHE_VERSION}`;

// Assets to pre-cache (app shell) — only things that never change
const STATIC_ASSETS = [
  '/manifest.json',
  '/icons/icon.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

// ─── Install ──────────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  console.log(`[SW] Installing ${CACHE_NAME}`);
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .then(() => {
        // Don't skip waiting automatically — let the user decide to update
        console.log('[SW] Install complete. Waiting for activation...');
      })
  );
});

// ─── Activate ─────────────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  console.log(`[SW] Activating ${CACHE_NAME}`);
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key.startsWith('recetario-') && key !== CACHE_NAME)
          .map((key) => {
            console.log(`[SW] Deleting old cache: ${key}`);
            return caches.delete(key);
          })
      )
    ).then(() => self.clients.claim())
  );

  // Notify all open clients that a new version is active
  self.clients.matchAll({ type: 'window' }).then((clients) => {
    clients.forEach((client) => {
      client.postMessage({
        type: 'SW_ACTIVATED',
        version: CACHE_VERSION,
      });
    });
  });
});

// ─── Fetch ────────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip: non-GET, API calls, chrome-extension
  if (
    request.method !== 'GET' ||
    url.pathname.startsWith('/api/') ||
    url.protocol === 'chrome-extension:'
  ) {
    return;
  }

  // '/' and index.html — always network-first so mobile always gets
  // the latest HTML with correct hashed bundle references
  if (url.pathname === '/' || url.pathname === '/index.html') {
    event.respondWith(networkFirst(request, true));
    return;
  }

  // App shell static assets (icons, manifest) — cache first
  if (STATIC_ASSETS.some((path) => url.pathname === path)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // JS/CSS assets (hashed names = immutable) — cache first
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Everything else — network first
  event.respondWith(networkFirst(request, false));
});

// ─── Cache strategies ─────────────────────────────────────────────────
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('Offline', { status: 503 });
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);

  const fetchPromise = fetch(request).then((response) => {
    if (response.ok) cache.put(request, response.clone());
    return response;
  }).catch(() => cached);

  return cached || fetchPromise;
}

async function networkFirst(request, cacheOnSuccess = true) {
  try {
    const response = await fetch(request);
    if (response.ok && cacheOnSuccess) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    // SPA fallback: return cached '/' for navigation requests
    const fallback = await caches.match('/');
    return fallback || new Response('Offline - por favor reconectá y recargá', {
      status: 503,
      headers: { 'Content-Type': 'text/plain' },
    });
  }
}

// ─── Message handler — from client ────────────────────────────────────
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    console.log('[SW] Skipping waiting — update requested by user');
    self.skipWaiting();
  }

  if (event.data?.type === 'GET_VERSION') {
    event.source.postMessage({ type: 'SW_VERSION', version: CACHE_VERSION });
  }
});

// ─── Background Sync ──────────────────────────────────────────────────
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-offline-queue') {
    console.log('[SW] Background sync triggered');
    event.waitUntil(
      self.clients.matchAll({ type: 'window' }).then((clients) => {
        clients.forEach((client) => {
          client.postMessage({ type: 'PROCESS_QUEUE' });
        });
      })
    );
  }
});
