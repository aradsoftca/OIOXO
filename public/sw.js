/* PR47 — oioxo service worker.
 * Strategy: cache-first for the standalone oioxo SEARCH shell (search.html) only,
 * stale-while-revalidate for the search shell's own static assets and the heavy
 * model weights on jsDelivr/HF, and bypass for everything else (third-party CORS
 * APIs and — critically — the Next.js app at /tools, /api, /_next, etc.).
 * Zero-server philosophy preserved.
 *
 * v98: hardening against a class of "stale cache bricks the app" failures —
 *   1. The search SW must NEVER intercept the Next.js app. Navigations to /tools/*
 *      (the studios) were being served the cached /search.html shell, leaving the
 *      editor stuck on a wrong/blank screen. Now only true search navigations are
 *      cache-first; every other navigation goes straight to the network.
 *   2. Next.js build output (/_next/*) is NEVER cached. A stale-while-revalidate
 *      cache of hashed JS chunks could pin a returning user on a corrupt/outdated
 *      chunk across a deploy (ChunkLoadError -> white "Loading…" screen with no
 *      recovery). These are immutable+hashed and the server already caches them
 *      correctly, so the SW must stay out of the way.
 *   3. Only same-origin, basic, status-200 responses are ever written to cache —
 *      never opaque/partial/error responses (prevents caching a truncated chunk).
 *   4. VERSION bump evicts the poisoned v97 cache on activate.
 */
const VERSION = 'oioxo-v98';
const SHELL = [
  '/search.html',
  '/manifest.webmanifest',
  '/icon.svg',
];

// Paths owned by the Next.js app — the search SW must never touch these.
function isAppPath(pathname) {
  return (
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/api/') ||
    pathname.startsWith('/tools') ||
    pathname.startsWith('/studios') ||
    pathname.startsWith('/pricing') ||
    pathname.startsWith('/account') ||
    pathname.startsWith('/auth')
  );
}

// A navigation we actually want to answer from the cached search shell.
function isSearchNavigation(url) {
  const p = url.pathname;
  return p === '/' || p === '/search' || p === '/search.html' || p === '/wrapped';
}

// Only cache responses that are safe to replay: same-origin, fully-formed, OK.
function isCacheable(res) {
  return !!res && res.status === 200 && res.type === 'basic';
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION).then((c) => c.addAll(SHELL).catch(() => null)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  let url;
  try { url = new URL(req.url); } catch (_) { return; }

  const sameOrigin = url.origin === self.location.origin;

  if (sameOrigin) {
    // HARD BYPASS: never intercept the Next.js app (chunks, API, studios, etc.).
    // This is what was bricking the studios — let the browser/server own these.
    if (isAppPath(url.pathname)) return;

    const isNavigation = req.mode === 'navigate' ||
      (req.headers.get('accept') || '').includes('text/html');

    if (isNavigation) {
      // Only answer SEARCH navigations from the cached shell. Any other HTML
      // navigation (Next.js page) goes to the network untouched so it can never
      // be hijacked by a stale shell.
      if (!isSearchNavigation(url)) return;
      event.respondWith(
        fetch(req).then((r) => {
          if (isCacheable(r)) {
            const copy = r.clone();
            caches.open(VERSION).then((c) => c.put('/search.html', copy)).catch(() => null);
          }
          return r;
        }).catch(() => caches.match('/search.html'))
      );
      return;
    }

    // Same-origin static assets for the SEARCH shell only — stale-while-revalidate.
    // (App assets are already excluded above via isAppPath.)
    event.respondWith(
      caches.match(req).then((cached) => {
        const network = fetch(req).then((r) => {
          if (isCacheable(r)) {
            const copy = r.clone();
            caches.open(VERSION).then((c) => c.put(req, copy)).catch(() => null);
          }
          return r;
        }).catch(() => cached);
        return cached || network;
      })
    );
    return;
  }

  // Cross-origin: only cache the heavy model weights (immutable, hashed URLs).
  const isModelAsset = /xenova|huggingface|jsdelivr/i.test(url.hostname);
  if (isModelAsset) {
    event.respondWith(
      caches.match(req).then((cached) => cached || fetch(req).then((r) => {
        // Cross-origin model responses are 'cors' (or 'opaque'); cache only OK cors.
        if (r && r.status === 200 && (r.type === 'cors' || r.type === 'basic')) {
          const copy = r.clone();
          caches.open(VERSION).then((c) => c.put(req, copy)).catch(() => null);
        }
        return r;
      }))
    );
  }
  // Everything else (Wikipedia, Wikidata, etc.) — let through untouched.
});
