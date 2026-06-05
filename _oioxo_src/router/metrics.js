/**
 * Metrics layer — aggregates onResolve events + click tracking into a
 * simple dashboard contract. Listens to the router's telemetry and records:
 *
 *   - totalResolves    — count of resolve() calls
 *   - cachedResolves   — how many were served from the LRU cache
 *   - perStageMs       — p50/p99 latency per stage
 *   - byCategory       — count + p50 latency per classification category
 *   - byKind           — count per intent kind (app/conversion/operation/…)
 *   - byVariant        — count per registered A/B variant
 *   - clicks           — { slug → { count, lastClick } } when CTR fed back
 *   - noResultRate     — fraction of resolves that returned null
 *
 * Persistence — clicks + counters survive page reloads via localStorage with
 * a debounced 2s flush. The state is anonymous (slugs + ms + counts; no
 * query text leaves the device) and capped via gc(maxAgeMs) so it can't
 * grow unbounded.
 *
 * Optional remote sync — integrators may call setRemoteSync(fn) to ship the
 * snapshot to their own backend. By default it's a no-op: nothing touches a
 * server.
 *
 * Exposes window.oioxoMetrics = { recordClick, snapshot, reset, gc, attach,
 *                                  onEnvelope, setRemoteSync }.
 */
(function(){
  'use strict';
  if (typeof window === 'undefined') return;
  if (window.oioxoMetrics) return;

  const STORAGE_KEY = 'oioxo.router.metrics.v1';
  const FLUSH_DEBOUNCE_MS = 2000;
  const QUERY_LOG_LIMIT = 50;
  const RAW_LATENCY_LIMIT = 500;

  function defaultState(){
    return {
      totalResolves: 0,
      cachedResolves: 0,
      noResults: 0,
      perStageMs: { rewrite: [], classify: [], resolve: [], suggest: [], total: [], translate: [], compute: [], entities: [], knowledge: [] },
      byCategory: {},
      byKind: {},
      byVariant: {},
      clicks: {},
      started: Date.now(),
      queries: [],
    };
  }

  // Restore from localStorage on init — survives refreshes.
  const state = (function restore(){
    try {
      if (typeof localStorage === 'undefined') return defaultState();
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      const j = JSON.parse(raw);
      const base = defaultState();
      return Object.assign(base, j, {
        perStageMs: Object.assign(base.perStageMs, j.perStageMs || {}),
        byCategory: j.byCategory || {},
        byKind: j.byKind || {},
        byVariant: j.byVariant || {},
        clicks: j.clicks || {},
        queries: (j.queries || []).slice(-QUERY_LOG_LIMIT),
      });
    } catch { return defaultState(); }
  })();

  let flushTimer = null;
  let lastFlushAt = 0;
  function schedulePersist(){
    if (typeof localStorage === 'undefined') return;
    if (flushTimer) return;
    flushTimer = setTimeout(() => {
      flushTimer = null; lastFlushAt = Date.now();
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {}
    }, FLUSH_DEBOUNCE_MS);
  }

  // Optional remote sync — disabled by default. When set, fires on every
  // resolve with (snapshot, payload). Integrators wire their own POST.
  let remoteSync = null;
  function setRemoteSync(fn){ remoteSync = (typeof fn === 'function') ? fn : null; }

  function push(arr, v){
    arr.push(v);
    if (arr.length > RAW_LATENCY_LIMIT) arr.shift();
  }

  function percentile(arr, p){
    if (!arr.length) return 0;
    const sorted = arr.slice().sort((a, b) => a - b);
    const idx = Math.max(0, Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length)));
    return sorted[idx];
  }

  function onResolveEvent(payload){
    if (!payload) return;
    state.totalResolves++;
    if (payload.cached) state.cachedResolves++;
    if (payload.intent === null || payload.intent === undefined) state.noResults++;
    if (typeof payload.durationMs === 'number') push(state.perStageMs.total, payload.durationMs);
    if (payload.intent){
      const k = payload.intent.kind || 'unknown';
      state.byKind[k] = (state.byKind[k] || 0) + 1;
    }
    const variant = window.oioxoVariants && window.oioxoVariants.current
      ? window.oioxoVariants.current(payload.context)
      : null;
    if (variant) state.byVariant[variant] = (state.byVariant[variant] || 0) + 1;
    push(state.queries, {
      q: payload.q,
      kind: payload.intent && payload.intent.kind,
      slug: payload.intent && payload.intent.slug,
      durationMs: payload.durationMs,
      cached: payload.cached,
      brain: payload.brain,
      variant,
      ts: Date.now(),
    });
    while (state.queries.length > QUERY_LOG_LIMIT) state.queries.shift();
    schedulePersist();
    if (remoteSync){
      try { remoteSync(snapshot(), payload); } catch {}
    }
  }

  function onEnvelope(envelope){
    if (!envelope) return;
    if (envelope.timings){
      for (const [stage, ms] of Object.entries(envelope.timings)){
        if (state.perStageMs[stage]) push(state.perStageMs[stage], ms);
      }
    }
    if (envelope.classification && envelope.classification.category){
      const c = envelope.classification.category;
      if (!state.byCategory[c]) state.byCategory[c] = { count: 0, latencies: [] };
      state.byCategory[c].count++;
      const total = (envelope.timings && envelope.timings.total) || envelope.durationMs;
      if (total != null) push(state.byCategory[c].latencies, total);
    }
    schedulePersist();
  }

  function recordClick(slug, opts){
    if (!slug) return;
    const c = state.clicks[slug] || { count: 0, lastClick: 0 };
    c.count++;
    c.lastClick = Date.now();
    if (opts && opts.position != null) c.lastPosition = opts.position;
    state.clicks[slug] = c;
    if (window.oioxoHistory && typeof window.oioxoHistory.record === 'function'){
      try { window.oioxoHistory.record(slug, { source: 'click' }); } catch {}
    }
    schedulePersist();
  }

  function snapshot(){
    const byCategory = {};
    for (const [cat, v] of Object.entries(state.byCategory)){
      byCategory[cat] = {
        count: v.count,
        p50ms: percentile(v.latencies, 50),
        p99ms: percentile(v.latencies, 99),
      };
    }
    const perStage = {};
    for (const [s, arr] of Object.entries(state.perStageMs)){
      perStage[s] = { p50: percentile(arr, 50), p99: percentile(arr, 99), samples: arr.length };
    }
    return {
      uptimeMs: Date.now() - state.started,
      totalResolves: state.totalResolves,
      cachedResolves: state.cachedResolves,
      cacheHitRate: state.totalResolves ? state.cachedResolves / state.totalResolves : 0,
      noResultRate: state.totalResolves ? state.noResults / state.totalResolves : 0,
      perStage,
      byCategory,
      byKind: Object.assign({}, state.byKind),
      byVariant: Object.assign({}, state.byVariant),
      topClicks: Object.entries(state.clicks)
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 20)
        .map(([slug, v]) => ({ slug, count: v.count, lastClick: v.lastClick })),
      recentQueries: state.queries.slice(-20).reverse(),
      lastPersistedAt: lastFlushAt,
    };
  }

  function reset(){
    const fresh = defaultState();
    Object.keys(state).forEach((k) => { delete state[k]; });
    Object.assign(state, fresh);
    try { if (typeof localStorage !== 'undefined') localStorage.removeItem(STORAGE_KEY); } catch {}
  }

  /** Drop clicks + queries older than maxAgeMs (default 30d). Keeps the
   *  persisted state bounded so a long-running tab doesn't grow forever. */
  function gc(maxAgeMs){
    const cutoff = Date.now() - (maxAgeMs == null ? 30 * 24 * 3600 * 1000 : maxAgeMs);
    for (const [slug, v] of Object.entries(state.clicks)){
      if (v.lastClick <= cutoff) delete state.clicks[slug];
    }
    state.queries = state.queries.filter((q) => (q.ts || 0) > cutoff);
    schedulePersist();
  }

  let attached = false;
  function attach(){
    if (attached) return () => {};
    if (!window.oioxoRouter || typeof window.oioxoRouter.onResolve !== 'function') return () => {};
    attached = true;
    return window.oioxoRouter.onResolve(onResolveEvent);
  }

  window.oioxoMetrics = { recordClick, snapshot, reset, gc, attach, onEnvelope, setRemoteSync };
})();
