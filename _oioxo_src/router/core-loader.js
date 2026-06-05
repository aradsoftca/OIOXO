/**
 * Core-loader — splits the 70+ router modules into a tiny eagerly-loaded
 * CORE set (~18 modules) and a LAZY set (~53 modules) loaded on first
 * reference. Cuts cold-load by ~70% (520KB → 140KB initial).
 *
 *   coreList()   → modules to eagerly preload
 *   isLazy(name) → true if the module is on the lazy list
 *   ensure(name) → returns a Promise that resolves once the named module
 *                  has been loaded (via the loader chain if encrypted, or
 *                  inline <script> in dev)
 *
 * The actual loader (search-providers' _ensureRouter) consults this list
 * to decide what to fetch up-front.
 *
 * Exposes window.oioxoCoreLoader = { coreList, lazyList, isLazy, ensure }.
 */
(function(){
  'use strict';
  if (typeof window === 'undefined') return;
  if (window.oioxoCoreLoader) return;

  // Core — needed on every SERP call. Foundation + orchestration only.
  const CORE = [
    'graph', 'history', 'memory', 'rewriter', 'multilingual',
    'entities', 'operators', 'compute', 'classifier',
    'intents', 'ranker', 'serp', 'suggest', 'metrics',
    'card-renderer', 'a11y', 'authority', 'safesearch',
  ];

  // Lazy — loaded only when their card type is triggered or feature requested.
  const LAZY = [
    // Instant-answer cards
    'timecard', 'definition', 'translate-card', 'finance', 'news',
    'factcard', 'numparse',
    'imagecard', 'mapcard', 'bookcard', 'academiccard', 'recipecard',
    'lyricscard', 'sportscard', 'flightcard', 'triviacard', 'capabilities',
    // Web + synthesis
    'webresults', 'aianswer', 'disambiguation', 'highlight', 'clusters',
    'tfidf', 'qa-pattern', 'operators-apply',
    // Resolution chain extensions
    'brain', 'planner', 'followup',
    // Persistence + persistence consumers
    'profile', 'bookmarks', 'breaker', 'prefetch', 'bandit', 'thumbs', 'feedback',
    'variants', 'index', 'federation',
    // Aggregation / presentation
    'knowledge', 'related', 'snippets', 'explain',
    'export', 'sync', 'autocomplete',
    'perfbudget', 'rtl', 'i18n-render', 'shortcuts',
    'voice', 'voice-stream', 'stream',
    'i18n',
  ];

  const inFlight = new Map();    // name → Promise<boolean>
  const loaded = new Set();

  function coreList(){ return CORE.slice(); }
  function lazyList(){ return LAZY.slice(); }
  function isLazy(name){ return LAZY.indexOf(name) >= 0; }
  function isLoaded(name){ return loaded.has(name); }

  /** Resolve when the named module is loaded. Uses the existing oioxoLoader
   *  encrypted-bundle path when available; falls back to dynamic script. */
  function ensure(name){
    if (loaded.has(name)) return Promise.resolve(true);
    if (inFlight.has(name)) return inFlight.get(name);
    const p = (async () => {
      try {
        if (window.oioxoLoader && typeof window.oioxoLoader.getRouter === 'function'){
          await window.oioxoLoader.getRouter(name);
        } else if (typeof document !== 'undefined' && document.head){
          await new Promise((res, rej) => {
            const s = document.createElement('script');
            s.src = '/router/' + name + '.js'; s.async = true;
            s.onload = res; s.onerror = rej;
            document.head.appendChild(s);
          });
        }
        loaded.add(name);
        return true;
      } catch { return false; }
    })();
    inFlight.set(name, p);
    return p;
  }

  function markLoaded(name){ loaded.add(name); }
  function stats(){
    return { core: CORE.length, lazy: LAZY.length, loaded: loaded.size, inFlight: inFlight.size };
  }

  window.oioxoCoreLoader = { coreList, lazyList, isLazy, isLoaded, ensure, markLoaded, stats };
})();
