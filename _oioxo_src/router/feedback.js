/**
 * Feedback loop — user 👍/👎 on a SERP card closes the bandit's learning
 * loop and lets the ranker demote results the user keeps rejecting.
 *
 *   recordPositive(slug, ctx)  — explicit thumbs up
 *   recordNegative(slug, ctx)  — explicit thumbs down + bandit penalty
 *   sentiment(slug)            — net score in [-N, +N], 0 = neutral
 *   snapshot()                 — for explain panel + analytics export
 *
 * Persisted to localStorage. Decays over 60 days so old grudges don't
 * stick forever (a tool we hated in v1 may be great in v2).
 *
 * Exposes window.oioxoFeedback = { recordPositive, recordNegative,
 *                                   sentiment, reset, snapshot, gc }.
 */
(function(){
  'use strict';
  if (typeof window === 'undefined') return;
  if (window.oioxoFeedback) return;

  const KEY = 'oioxo.router.feedback.v1';
  const DECAY_MS = 60 * 24 * 3600 * 1000;
  const FLUSH_MS = 1500;

  function restore(){
    try {
      if (typeof localStorage === 'undefined') return { signals: {}, lastTouch: Date.now() };
      const raw = localStorage.getItem(KEY);
      if (!raw) return { signals: {}, lastTouch: Date.now() };
      return Object.assign({ signals: {}, lastTouch: Date.now() }, JSON.parse(raw));
    } catch { return { signals: {}, lastTouch: Date.now() }; }
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

  function decay(){
    const dt = Date.now() - state.lastTouch;
    if (dt <= 0) return;
    const factor = Math.pow(0.5, dt / DECAY_MS);
    if (factor >= 0.999) return;
    for (const k of Object.keys(state.signals)){
      state.signals[k] = state.signals[k] * factor;
      if (Math.abs(state.signals[k]) < 0.05) delete state.signals[k];
    }
    state.lastTouch = Date.now();
  }

  function recordPositive(slug, ctx){
    if (!slug) return;
    decay();
    state.signals[slug] = (state.signals[slug] || 0) + 1;
    if (ctx && ctx.category && window.oioxoProfile && window.oioxoProfile.observe){
      try { window.oioxoProfile.observe(ctx.category, 1.5); } catch {}
    }
    if (ctx && window.oioxoBandit && window.oioxoBandit.recordClick){
      try { window.oioxoBandit.recordClick(slug, ctx.position || 0); } catch {}
    }
    persist();
  }

  function recordNegative(slug, ctx){
    if (!slug) return;
    decay();
    state.signals[slug] = (state.signals[slug] || 0) - 1;
    // Bandit: count as impression-without-click (forces a negative update).
    if (ctx && window.oioxoBandit && window.oioxoBandit.recordImpression){
      try { window.oioxoBandit.recordImpression(slug, ctx.position || 0); } catch {}
    }
    persist();
  }

  /** Net sentiment for a slug. Used by the ranker as a multiplier:
   *  -1 → 0.7×, 0 → 1.0×, +1 → 1.15× (gentle to avoid feedback runaway). */
  function sentiment(slug){
    decay();
    if (!slug) return 0;
    return state.signals[slug] || 0;
  }

  function snapshot(){
    decay();
    const entries = Object.entries(state.signals)
      .map(([slug, v]) => ({ slug, score: Math.round(v * 100) / 100 }))
      .sort((a, b) => Math.abs(b.score) - Math.abs(a.score));
    return {
      positive: entries.filter((e) => e.score > 0).slice(0, 20),
      negative: entries.filter((e) => e.score < 0).slice(0, 20),
      total: entries.length,
    };
  }

  function reset(){
    state.signals = {}; state.lastTouch = Date.now();
    try { if (typeof localStorage !== 'undefined') localStorage.removeItem(KEY); } catch {}
  }

  function gc(maxAgeMs){
    decay();
    const cutoff = Date.now() - (maxAgeMs == null ? 90 * 24 * 3600 * 1000 : maxAgeMs);
    if (state.lastTouch <= cutoff) reset();
  }

  window.oioxoFeedback = { recordPositive, recordNegative, sentiment, snapshot, reset, gc };
})();
