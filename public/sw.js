// Mesa OS Lite — diner service worker (Phase 7, PRD §4.7).
// Scope: /r/  (configured via Service-Worker-Allowed header in next.config.ts;
// only diner pages register this SW — admin/owner are never controlled.)
//
// Caching contract:
// - /api/menu/[slug] and /api/admin/state are served by routes that set
//   Cache-Control: no-store. The SW MUST honor that while online: every
//   request hits the network, every successful response is returned fresh.
//   We mirror successes into a fallback cache that is consulted ONLY when
//   navigator.onLine === false, so mode changes / closing-mode revert can
//   never be masked by a stale SW cache (Bug #3 from the 2026-05-10 QA).
// - Static Next assets are content-hashed → CacheFirst, no expiry.
// - Product images come from R2 → CacheFirst with LRU max 50 (PRD §4.7).
// - Navigations to /r/* fall back to the last good HTML when offline.

const VERSION = 'v1';
const STATIC_CACHE = `mesa-static-${VERSION}`;
const IMAGE_CACHE = `mesa-images-${VERSION}`;
const API_FALLBACK_CACHE = `mesa-api-fallback-${VERSION}`;
const HTML_CACHE = `mesa-html-${VERSION}`;
const KEEP = new Set([STATIC_CACHE, IMAGE_CACHE, API_FALLBACK_CACHE, HTML_CACHE]);

const IMAGE_LRU_MAX = 50;

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => !KEEP.has(k)).map((k) => caches.delete(k)));
      await self.clients.claim();

      // Prime HTML_CACHE for any /r/* page that's already open.
      //
      // The very first navigation to /r/<slug> happens BEFORE this SW is
      // installed, so it never flows through `handleNavigation` and nothing
      // ends up in cache. If the diner went offline at that point the
      // reload would have nothing to serve.
      //
      // We re-fetch each currently-open diner URL via the network (SW-side
      // fetch() does NOT recurse into the SW's own fetch handler) and put
      // the response into HTML_CACHE. The activate event's waitUntil holds
      // off `serviceWorker.ready` until this completes, so callers that
      // await `ready` know the cache is primed.
      const htmlCache = await caches.open(HTML_CACHE);
      const windowClients = await self.clients.matchAll({ type: 'window' });
      await Promise.all(
        windowClients.map(async (client) => {
          try {
            const url = new URL(client.url);
            if (url.origin !== self.location.origin) return;
            if (!url.pathname.startsWith('/r/')) return;
            const res = await fetch(client.url, { credentials: 'same-origin' });
            if (res && res.ok) await htmlCache.put(client.url, res);
          } catch {
            // Best effort — a transient failure here just means the user
            // needs one more online navigation before offline works.
          }
        }),
      );
    })(),
  );
});

// Optional client-driven priming. Used by sw-register.tsx after registration
// to explicitly cache the page the user is on, covering edge cases where the
// activate-time priming missed (e.g. SW updated mid-session).
self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || typeof data !== 'object') return;
  if (data.type !== 'CACHE_PAGE' || typeof data.url !== 'string') return;
  event.waitUntil(
    (async () => {
      try {
        const url = new URL(data.url);
        if (url.origin !== self.location.origin) return;
        if (!url.pathname.startsWith('/r/')) return;
        const res = await fetch(data.url, { credentials: 'same-origin' });
        if (res && res.ok) {
          const cache = await caches.open(HTML_CACHE);
          await cache.put(data.url, res);
        }
      } catch {
        // best effort
      }
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;

  // 1) Diner page navigation — NetworkFirst, offline fallback to cached HTML.
  if (req.mode === 'navigate' && sameOrigin && url.pathname.startsWith('/r/')) {
    event.respondWith(handleNavigation(req));
    return;
  }

  // 2) APIs that the diner polls — online-aware NetworkFirst.
  if (
    sameOrigin &&
    (url.pathname.startsWith('/api/menu/') || url.pathname === '/api/admin/state')
  ) {
    event.respondWith(handleApi(req));
    return;
  }

  // 3) Hashed Next static assets + fonts — immutable, CacheFirst.
  if (
    sameOrigin &&
    (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/fonts/'))
  ) {
    event.respondWith(cacheFirst(req, STATIC_CACHE));
    return;
  }

  // 4) Manifest + brand icons (SVG + PNGs) — CacheFirst. Keeps icons out of
  //    the 50-slot image LRU so product photos can fill that quota.
  if (
    sameOrigin &&
    (url.pathname === '/icon.svg' ||
      url.pathname === '/apple-touch-icon.png' ||
      url.pathname.startsWith('/icon-') ||
      url.pathname.endsWith('.webmanifest'))
  ) {
    event.respondWith(cacheFirst(req, STATIC_CACHE));
    return;
  }

  // 5) Images (R2 product photos, logos) — CacheFirst with LRU 50.
  if (req.destination === 'image') {
    event.respondWith(imageCacheFirst(req));
    return;
  }

  // Anything else falls through to the network with no SW involvement.
});

async function handleNavigation(req) {
  try {
    const res = await fetch(req);
    if (res && res.ok) {
      const cache = await caches.open(HTML_CACHE);
      cache.put(req, res.clone()).catch(() => {});
    }
    return res;
  } catch (err) {
    const cache = await caches.open(HTML_CACHE);
    const cached = await cache.match(req);
    if (cached) return cached;
    // Same-origin /r/* fallback — any cached diner HTML beats a hard error.
    const all = await cache.keys();
    if (all.length > 0) {
      const any = await cache.match(all[all.length - 1]);
      if (any) return any;
    }
    throw err;
  }
}

async function handleApi(req) {
  try {
    const res = await fetch(req);
    // Mirror successes into the offline-only cache. We never read this
    // cache while online (see catch), so no-store on the live route is
    // preserved end-to-end.
    if (res && res.ok) {
      const cache = await caches.open(API_FALLBACK_CACHE);
      cache.put(req, res.clone()).catch(() => {});
    }
    return res;
  } catch (err) {
    if (self.navigator && self.navigator.onLine === false) {
      const cache = await caches.open(API_FALLBACK_CACHE);
      const cached = await cache.match(req);
      if (cached) return cached;
    }
    throw err;
  }
}

async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  if (cached) return cached;
  const res = await fetch(req);
  if (res && res.ok) cache.put(req, res.clone()).catch(() => {});
  return res;
}

async function imageCacheFirst(req) {
  const cache = await caches.open(IMAGE_CACHE);
  const cached = await cache.match(req);
  if (cached) return cached;
  const res = await fetch(req);
  if (res && (res.ok || res.type === 'opaque')) {
    await cache.put(req, res.clone()).catch(() => {});
    const keys = await cache.keys();
    const overflow = keys.length - IMAGE_LRU_MAX;
    if (overflow > 0) {
      for (let i = 0; i < overflow; i++) {
        await cache.delete(keys[i]);
      }
    }
  }
  return res;
}
