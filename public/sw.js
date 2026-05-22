/*
 * Xonvert asset cache — deliberately tiny and SAFE.
 *
 * It ONLY intercepts the big, immutable WASM cores + worker glue (30 MB+ files
 * that browsers may evict from the HTTP cache under pressure). It serves those
 * cache-first so the second use of any heavy tool is instant and works offline.
 *
 * It never caches HTML, app JS/CSS, or API calls — for every other request it
 * does not call respondWith at all, so the browser behaves exactly as if no
 * service worker existed. That means it can never serve a stale app shell.
 */

const CACHE = 'xonvert-wasm-v1';

// Path prefixes we cache. Keep in sync with the immutable dirs in next.config.
const CACHEABLE = [
  '/ffmpeg/',
  '/ffmpeg-mt/',
  '/occt/',
  '/mediapipe/',
  '/assimpjs/',
  '/libarchive/',
  '/pdf.worker.min.mjs',
  '/gif.worker.js',
];

self.addEventListener('install', () => {
  // Activate immediately; we don't precache (assets are fetched on first use).
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Drop old cache versions.
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

function isCacheable(url) {
  return url.origin === self.location.origin && CACHEABLE.some((p) => url.pathname.startsWith(p));
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  let url;
  try { url = new URL(req.url); } catch { return; }
  if (!isCacheable(url)) return; // hands control back to the browser — no interception

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const hit = await cache.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      // Only store complete, OK responses (skip opaque/partial).
      if (res && res.ok && res.status === 200) {
        cache.put(req, res.clone());
      }
      return res;
    })(),
  );
});
