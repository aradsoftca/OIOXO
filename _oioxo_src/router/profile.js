/**
 * User profile / personalization — quietly learns category affinities from
 * click history (not from query text — query text never leaves the device,
 * and we don't store it here either; only category counts).
 *
 * After 5 clicks on image tools, future image tools get a small score
 * boost without becoming a runaway echo chamber (square-root scaling).
 *
 * Persistent — backed by localStorage, version-keyed so a catalog change
 * resets the profile cleanly. Anonymous: only category strings + counts,
 * no slugs, no queries.
 *
 * Exposes window.oioxoProfile = { observe, affinity, snapshot, reset }.
 */
(function(){
  'use strict';
  if (typeof window === 'undefined') return;
  if (window.oioxoProfile) return;

  const KEY = 'oioxo.router.profile.v1';
  const DECAY_MS = 30 * 24 * 3600 * 1000; // 30 days half-decay

  function restore(){
    try {
      if (typeof localStorage === 'undefined') return { counts: {}, lastTouch: Date.now() };
      const raw = localStorage.getItem(KEY);
      if (!raw) return { counts: {}, lastTouch: Date.now() };
      const j = JSON.parse(raw);
      return { counts: j.counts || {}, lastTouch: j.lastTouch || Date.now() };
    } catch { return { counts: {}, lastTouch: Date.now() }; }
  }

  const state = restore();

  let persistTimer = null;
  function persist(){
    if (typeof localStorage === 'undefined') return;
    if (persistTimer) return;
    persistTimer = setTimeout(() => {
      persistTimer = null;
      try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {}
    }, 1000);
  }

  /** Apply decay since last touch — exponential, half-life DECAY_MS. */
  function decay(){
    const dt = Date.now() - state.lastTouch;
    if (dt <= 0) return;
    const factor = Math.pow(0.5, dt / DECAY_MS);
    if (factor >= 0.999) return;
    for (const k of Object.keys(state.counts)){
      state.counts[k] = state.counts[k] * factor;
      if (state.counts[k] < 0.05) delete state.counts[k];
    }
    state.lastTouch = Date.now();
  }

  /** Tell the profile that the user just clicked a card in `category`. */
  function observe(category, weight){
    if (!category) return;
    decay();
    state.counts[category] = (state.counts[category] || 0) + (weight || 1);
    state.lastTouch = Date.now();
    persist();
  }

  /** Return a [0, 1) affinity score for the category — square-root scaled
   *  vs. the total so dominant categories don't blow out, and minority
   *  categories still get any boost. */
  function affinity(category){
    decay();
    if (!category) return 0;
    const total = Object.values(state.counts).reduce((s, x) => s + x, 0);
    if (total < 3) return 0; // need at least 3 clicks before personalising
    const c = state.counts[category] || 0;
    return Math.sqrt(c / total);
  }

  function snapshot(){
    decay();
    const total = Object.values(state.counts).reduce((s, x) => s + x, 0);
    const breakdown = {};
    for (const [k, v] of Object.entries(state.counts)){
      breakdown[k] = { count: Math.round(v * 100) / 100, share: total ? v / total : 0 };
    }
    return { totalClicks: Math.round(total), breakdown, lastTouch: state.lastTouch };
  }

  function reset(){
    state.counts = {}; state.lastTouch = Date.now();
    try { if (typeof localStorage !== 'undefined') localStorage.removeItem(KEY); } catch {}
  }

  window.oioxoProfile = { observe, affinity, snapshot, reset };
})();
