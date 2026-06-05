/**
 * Regression detector — compares challenge harness results from this run
 * to a prior snapshot stored in localStorage, alerts if any prompt class
 * dropped.
 *
 *   compare(currentScores, baselineScores) → { regressed: [], improved: [], same: [] }
 *   snapshot(scores)                       — store as baseline
 *   load()                                  — load latest baseline
 *
 * Exposes window.oioxoRegression = { compare, snapshot, load }.
 */
(function(){
  'use strict';
  if (typeof window === 'undefined') return;
  if (window.oioxoRegression) return;

  const KEY = 'oioxo.regression.baseline.v1';

  function load(){
    try {
      if (typeof localStorage === 'undefined') return null;
      const raw = localStorage.getItem(KEY);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }

  function snapshot(scores){
    try {
      if (typeof localStorage === 'undefined') return false;
      localStorage.setItem(KEY, JSON.stringify({ ts: Date.now(), scores }));
      return true;
    } catch { return false; }
  }

  function compare(current, baseline){
    baseline = baseline || (load() && load().scores) || {};
    const regressed = [];
    const improved = [];
    const same = [];
    for (const cat of Object.keys(current)){
      const c = current[cat]; const b = baseline[cat];
      if (b == null) continue;
      if (c < b) regressed.push({ category: cat, was: b, now: c, delta: c - b });
      else if (c > b) improved.push({ category: cat, was: b, now: c, delta: c - b });
      else same.push(cat);
    }
    return { regressed, improved, same };
  }

  window.oioxoRegression = { compare, snapshot, load };
})();
