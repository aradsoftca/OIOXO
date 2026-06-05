/**
 * Tool usage history — LRU 20 in localStorage so the router can boost
 * recently-used tools in the fuzzy stage. The boost is small (+1.0 to
 * score) so it shapes ranking without overriding clear pattern matches.
 *
 * Exposes window.oioxoHistory = { record, recent, clear, contains, scoreBoost }.
 */
(function(){
  'use strict';
  if (typeof window === 'undefined') return;
  if (window.oioxoHistory) return;

  const KEY = 'oioxo.router.history.v1';
  const LIMIT = 20;
  const RECENCY_WINDOW_MS = 14 * 24 * 3600 * 1000; // boost only counts the last 2 weeks

  function read(){
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return [];
      const j = JSON.parse(raw);
      return Array.isArray(j) ? j : [];
    } catch { return []; }
  }
  function write(list){
    try { localStorage.setItem(KEY, JSON.stringify(list)); } catch {}
  }

  /** Append a tool use. Drops duplicates so the same tool re-emerges to the
   *  top of the LRU rather than filling the list. */
  function record(slug, opts){
    if (!slug || typeof slug !== 'string') return;
    const list = read().filter((e) => e.slug !== slug);
    list.unshift({ slug, ts: Date.now(), source: (opts && opts.source) || null });
    while (list.length > LIMIT) list.pop();
    write(list);
  }

  function recent(n){
    const list = read();
    n = Math.max(1, Math.min(LIMIT, n || 5));
    return list.slice(0, n);
  }

  function contains(slug){
    return read().some((e) => e.slug === slug);
  }

  /** Score boost for a tool slug — 0 if not in history, decays linearly with
   *  age over RECENCY_WINDOW_MS. Used by the fuzzy stage. */
  function scoreBoost(slug){
    if (!slug) return 0;
    const list = read();
    const e = list.find((x) => x.slug === slug);
    if (!e) return 0;
    const age = Date.now() - e.ts;
    if (age >= RECENCY_WINDOW_MS) return 0;
    return 1.0 * (1 - age / RECENCY_WINDOW_MS);
  }

  function clear(){ try { localStorage.removeItem(KEY); } catch {} }

  window.oioxoHistory = { record, recent, contains, scoreBoost, clear };
})();
