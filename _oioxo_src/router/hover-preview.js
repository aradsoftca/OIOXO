/**
 * Hover preview — fetches a short content snippet via r.jina.ai for any
 * web result hovered over. Debounced 250ms; cached LRU 50.
 *
 *   request(url, callback)    — debounced fetch; cb({ md, title })
 *   prime(url)                — async-warm a URL into cache
 *   stats()                   — { hits, fetches }
 *
 * Exposes window.oioxoHoverPreview = { … }.
 */
(function(){
  'use strict';
  if (typeof window === 'undefined') return;
  if (window.oioxoHoverPreview) return;

  const cache = new Map();
  const CACHE_LIMIT = 50;
  const DEBOUNCE_MS = 250;
  const BUDGET_MS = 1500;
  let inflightTimer = null;
  let stats = { hits: 0, fetches: 0 };

  function cacheGet(key){
    if (!cache.has(key)) return null;
    const v = cache.get(key);
    cache.delete(key); cache.set(key, v);  // LRU refresh
    return v;
  }
  function cacheSet(key, value){
    if (cache.has(key)) cache.delete(key);
    cache.set(key, value);
    while (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value);
  }

  async function fetchOne(url){
    if (typeof fetch === 'undefined') return null;
    try {
      const proxied = 'https://r.jina.ai/' + url;
      const r = await Promise.race([
        fetch(proxied).then((r) => r.ok ? r.text() : null),
        new Promise((res) => setTimeout(() => res(null), BUDGET_MS)),
      ]);
      if (!r) return null;
      // Extract first non-empty paragraph as preview.
      const lines = r.split('\n').map((l) => l.trim()).filter(Boolean);
      const titleLine = lines.find((l) => /^#\s+/.test(l));
      const title = titleLine ? titleLine.replace(/^#\s+/, '') : '';
      const body = lines.filter((l) => !/^#/.test(l) && !/^[*\-+]\s/.test(l))
        .slice(0, 6).join(' ').slice(0, 320);
      return { title, md: body };
    } catch { return null; }
  }

  async function prime(url){
    if (!url) return null;
    if (cache.has(url)) { stats.hits++; return cache.get(url); }
    stats.fetches++;
    const r = await fetchOne(url);
    if (r) cacheSet(url, r);
    return r;
  }

  /** Debounced — callback fires after DEBOUNCE_MS of stable hover. */
  function request(url, callback){
    if (inflightTimer) clearTimeout(inflightTimer);
    inflightTimer = setTimeout(async () => {
      inflightTimer = null;
      if (cache.has(url)){ stats.hits++; callback(cache.get(url)); return; }
      stats.fetches++;
      const r = await fetchOne(url);
      if (r){ cacheSet(url, r); callback(r); }
      else callback(null);
    }, DEBOUNCE_MS);
  }

  function snapshot(){ return Object.assign({}, stats, { cacheSize: cache.size }); }

  window.oioxoHoverPreview = { request, prime, stats: snapshot };
})();
