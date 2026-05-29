/* PR47 — oioxo service worker.
 * Strategy: cache-first for the app shell (search.html + search/), stale-while-revalidate
 * for fonts/CDN assets, and bypass for all third-party CORS API calls (which must always
 * be live and respect their own cache headers). Zero-server philosophy preserved.
 */
const VERSION = 'oioxo-v97';
// Note: /wrapped is rewritten to /search.html server-side (serve.json), and the
// SW already cache-firsts /search.html for every HTML navigation, so the new
// path needs no additional handling here — only this version bump to evict v7.
const SHELL = [
  '/',
  '/search',
  '/search.html',
  '/index.html',
  '/manifest.webmanifest',
  '/icon.svg',
];

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

  // Only intercept same-origin shell requests + Xenova model assets on jsDelivr/HF
  const sameOrigin = url.origin === self.location.origin;
  const isModelAsset = /xenova|huggingface|jsdelivr/i.test(url.hostname);

  if (sameOrigin) {
    // For HTML navigation, cache-first with network fallback (offline shell)
    if (req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html')) {
      event.respondWith(
        caches.match('/search.html').then((cached) => cached || fetch(req).then((r) => {
          const copy = r.clone();
          caches.open(VERSION).then((c) => c.put('/search.html', copy)).catch(() => null);
          return r;
        }).catch(() => caches.match('/')))
      );
      return;
    }
    // Static assets — stale-while-revalidate
    event.respondWith(
      caches.match(req).then((cached) => {
        const network = fetch(req).then((r) => {
          if (r && r.status === 200) {
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

  if (isModelAsset) {
    // Embedder/cross-encoder weights — heavy, cache aggressively (immutable hashes)
    event.respondWith(
      caches.match(req).then((cached) => cached || fetch(req).then((r) => {
        if (r && r.status === 200) {
          const copy = r.clone();
          caches.open(VERSION).then((c) => c.put(req, copy)).catch(() => null);
        }
        return r;
      }))
    );
  }
  // All other (Wikipedia, Wikidata, etc.) — let through untouched.
});
