/**
 * Performance budget — wraps the metrics layer with a small budget
 * enforcement / warning surface. The router can call check(envelope) to
 * see if any stage exceeded its p99 ceiling and label it accordingly.
 *
 *   check(envelope)  → { warnings: [...], total: ms }
 *   set(stage, p99)  → adjust budget at runtime
 *   defaults         → conservative on-device ceilings
 *
 * Exposes window.oioxoPerfbudget = { check, set, snapshot, defaults }.
 */
(function(){
  'use strict';
  if (typeof window === 'undefined') return;
  if (window.oioxoPerfbudget) return;

  // Per-stage p99 ceilings (ms). Tuned for a desktop browser on broadband.
  // Anything sustained above this triggers a metric warning.
  const defaults = {
    rewrite:    5,
    classify:   5,
    compute:    8,
    entities:   8,
    resolve:    20,
    suggest:    10,
    related:    10,
    federation: 800,
    web:        1200,
    aiAnswer:   60,
    knowledge:  1200,
    translate:  400,
    compute_units: 8,
    total:      2000,
  };
  const budgets = Object.assign({}, defaults);

  let cumulativeWarnings = 0;

  function set(stage, p99){ if (stage && p99 > 0) budgets[stage] = p99; }

  function check(envelope){
    if (!envelope || !envelope.timings) return { warnings: [], total: 0 };
    const warnings = [];
    let total = 0;
    for (const [stage, ms] of Object.entries(envelope.timings)){
      total += ms;
      const ceiling = budgets[stage];
      if (ceiling && ms > ceiling){
        warnings.push({ stage, ms, ceiling, overBy: ms - ceiling });
      }
    }
    if (budgets.total && total > budgets.total){
      warnings.push({ stage: 'total', ms: total, ceiling: budgets.total, overBy: total - budgets.total });
    }
    cumulativeWarnings += warnings.length;
    return { warnings, total };
  }

  function snapshot(){
    return { budgets, cumulativeWarnings };
  }

  window.oioxoPerfbudget = { check, set, snapshot, defaults };
})();
