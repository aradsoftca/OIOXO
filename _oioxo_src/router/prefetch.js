/**
 * Predictive prefetch — when the classifier decides a query is tool-shaped,
 * we kick off an idle-time prefetch of the winning tool's chunk so the
 * tool page loads instantly when the user clicks.
 *
 * Uses <link rel="prefetch"> when the browser supports it, otherwise no-op.
 * Dedupes by URL — never refetches what's already in flight or done.
 *
 * Strict budget: at most `MAX_INFLIGHT` concurrent prefetches, at most
 * `MAX_PER_SESSION` total per page life, and only when the connection
 * isn't on a metered/slow link (navigator.connection.saveData=true skips).
 *
 * Exposes window.oioxoPrefetch = { hint, stats, reset }.
 */
(function(){
  'use strict';
  if (typeof window === 'undefined') return;
  if (window.oioxoPrefetch) return;

  const MAX_INFLIGHT = 3;
  const MAX_PER_SESSION = 30;
  const seen = new Set();
  let inflight = 0;
  let prefetched = 0;

  function isSaveData(){
    try {
      const c = navigator.connection;
      if (!c) return false;
      if (c.saveData) return true;
      if (c.effectiveType && /(slow-2g|2g)/i.test(c.effectiveType)) return true;
      return false;
    } catch { return false; }
  }

  function injectHint(href){
    try {
      if (typeof document === 'undefined' || !document.head) return false;
      const link = document.createElement('link');
      link.rel = 'prefetch';
      link.as = 'document';
      link.href = href;
      link.crossOrigin = 'anonymous';
      document.head.appendChild(link);
      return true;
    } catch { return false; }
  }

  /** Hint to the browser that the user is likely to navigate here next.
   *  Safe to call rapidly; deduped, budgeted, and respectful of saveData. */
  function hint(url){
    if (!url || typeof url !== 'string') return false;
    if (seen.has(url)) return false;
    if (prefetched >= MAX_PER_SESSION) return false;
    if (inflight >= MAX_INFLIGHT) return false;
    if (isSaveData()) return false;
    seen.add(url);
    inflight++; prefetched++;
    const ok = injectHint(url);
    // We don't actually know when prefetch completes; release the inflight
    // counter on a short timer so we keep budget pressure honest.
    setTimeout(() => { inflight = Math.max(0, inflight - 1); }, 800);
    return ok;
  }

  function stats(){ return { inflight, prefetched, distinct: seen.size }; }
  function reset(){ seen.clear(); inflight = 0; prefetched = 0; }

  window.oioxoPrefetch = { hint, stats, reset };
})();
