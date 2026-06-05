/**
 * Thompson-sampling bandit for suggestion / SERP-card position ranking.
 *
 * Each slug at each position is a Beta-distributed arm whose mean is the
 * click-through rate. On every render we DRAW from each arm, sort, show.
 * The draws naturally balance exploration (uncertain arms get random
 * boosts) and exploitation (high-CTR arms win). Local-only — no server.
 *
 *   recordImpression(slug, position?)
 *   recordClick(slug, position?)
 *   score(slug, position?)              — draw a value from Beta(α,β)
 *   rank(slugs, position?)              — pure sort by score
 *   snapshot()                          — for the explain panel
 *
 * Persistent — backed by localStorage, key versioned so a catalog bump can
 * reset learning cleanly. Anonymous: only slugs + integer counts.
 *
 * Exposes window.oioxoBandit = { recordImpression, recordClick, score,
 *                                 rank, snapshot, reset, gc }.
 */
(function(){
  'use strict';
  if (typeof window === 'undefined') return;
  if (window.oioxoBandit) return;

  const KEY = 'oioxo.router.bandit.v1';
  const FLUSH_MS = 1500;

  function restore(){
    try {
      if (typeof localStorage === 'undefined') return { arms: {} };
      const raw = localStorage.getItem(KEY);
      return raw ? Object.assign({ arms: {} }, JSON.parse(raw)) : { arms: {} };
    } catch { return { arms: {} }; }
  }

  const state = restore();
  let flushTimer = null;
  function persist(){
    if (typeof localStorage === 'undefined') return;
    if (flushTimer) return;
    flushTimer = setTimeout(() => {
      flushTimer = null;
      try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {}
    }, FLUSH_MS);
  }

  function armKey(slug, position){
    return slug + (position == null ? '' : '@' + position);
  }
  function getArm(slug, position){
    const k = armKey(slug, position);
    if (!state.arms[k]) state.arms[k] = { i: 0, c: 0, ts: Date.now() };
    return state.arms[k];
  }

  function recordImpression(slug, position){
    if (!slug) return;
    const a = getArm(slug, position);
    a.i++; a.ts = Date.now();
    persist();
  }
  function recordClick(slug, position){
    if (!slug) return;
    const a = getArm(slug, position);
    a.c++; a.ts = Date.now();
    persist();
  }

  /** Sample from Beta(alpha=clicks+1, beta=impressions-clicks+1) using
   *  the Marsaglia gamma trick — exact, fast, no external library.
   *  Higher value ≈ higher expected CTR (with exploration noise). */
  function sampleBeta(alpha, beta){
    function gamma(k){
      // Marsaglia & Tsang 2000 — for k >= 1.
      if (k < 1) return gamma(k + 1) * Math.pow(Math.random(), 1 / k);
      const d = k - 1 / 3, c = 1 / Math.sqrt(9 * d);
      while (true){
        let x, v;
        do { x = normal(); v = 1 + c * x; } while (v <= 0);
        v = v * v * v;
        const u = Math.random();
        if (u < 1 - 0.0331 * x * x * x * x) return d * v;
        if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
      }
    }
    function normal(){
      let u = 0, v = 0;
      while (u === 0) u = Math.random();
      while (v === 0) v = Math.random();
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    }
    const x = gamma(alpha);
    const y = gamma(beta);
    return x / (x + y);
  }

  /** Public score — returns a [0,1) draw representing this arm's estimate
   *  of click probability with exploration noise. Cold-start arms draw
   *  from Beta(1,1) = uniform. */
  function score(slug, position){
    const a = getArm(slug, position);
    return sampleBeta(a.c + 1, (a.i - a.c) + 1);
  }

  /** Rank a list of slugs by Thompson draw. Returns slugs in score order. */
  function rank(slugs, position){
    if (!Array.isArray(slugs)) return [];
    return slugs
      .map((s) => ({ slug: s, v: score(s, position) }))
      .sort((a, b) => b.v - a.v)
      .map((x) => x.slug);
  }

  function snapshot(opts){
    opts = opts || {};
    const arr = Object.entries(state.arms).map(([k, a]) => {
      const ctr = a.i ? a.c / a.i : 0;
      return { arm: k, impressions: a.i, clicks: a.c, ctr: Math.round(ctr * 1000) / 10 };
    }).sort((a, b) => b.impressions - a.impressions);
    return { arms: arr.slice(0, opts.limit || 50) };
  }

  function reset(){
    state.arms = {};
    try { if (typeof localStorage !== 'undefined') localStorage.removeItem(KEY); } catch {}
  }

  /** GC arms not touched in maxAgeMs (default 90 days). */
  function gc(maxAgeMs){
    const cutoff = Date.now() - (maxAgeMs == null ? 90 * 24 * 3600 * 1000 : maxAgeMs);
    for (const [k, a] of Object.entries(state.arms)){
      if ((a.ts || 0) <= cutoff) delete state.arms[k];
    }
    persist();
  }

  window.oioxoBandit = { recordImpression, recordClick, score, rank, snapshot, reset, gc };
})();
