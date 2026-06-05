/**
 * Brain bridge — single source of truth for the on-device LLM integration.
 * Consumed by two surfaces:
 *
 *   intents.js   → calls .route(query, catalog, context) for tool-routing
 *                  escalation when regex stages all miss. Expects a
 *                  ResolvedIntent { kind, slug, tool, params, confidence, … }.
 *
 *   chainrunner  → calls .planTurn(query, ctx) for multi-step chains.
 *                  Expects [{ step: 'search'|'card:<kind>'|'compute'|…,
 *                  payload: { … } }].
 *
 * Implementers register a single planner via .register(impl). The bridge
 * derives BOTH shapes from one BrainPlan call so the LLM only generates once
 * per turn. Falls back to a heuristic single-step chain when no impl is
 * registered.
 *
 * BrainPlan contract (matches lib/ai/brain-runtime.ts):
 *   { turnRole, goal, chain:[{step:"surface:id", can, alternative?}],
 *     params, mediaNeed, style, remember, ask, reply }
 *
 * Exposes window.oioxoBrainBridge = {
 *   register, isAvailable, abstainHint,
 *   planTurn(q, ctx),                  // chain[] shape for chainrunner
 *   route(q, catalog, context),        // ResolvedIntent for intents.js
 * }.
 */
(function(){
  'use strict';
  if (typeof window === 'undefined') return;
  if (window.oioxoBrainBridge) return;

  let impl = null;     // { planTurn(message, history?, hasFile?, fileType?, imageDesc?) → BrainPlan }
  let warm = false;
  const RECENT_TURNS = 8;
  const turnHistory = [];   // [{ role:'user'|'assistant', text }]

  /** Install a planner. The shape we want is the v3 brain-runtime's planTurn —
   *  it returns a structured BrainPlan we can adapt to either surface. */
  function register(brainImpl){
    if (!brainImpl || typeof brainImpl.planTurn !== 'function') return false;
    impl = brainImpl;
    warm = true;
    return true;
  }

  function isAvailable(){ return !!impl && warm; }

  /** Short / deterministic queries the regex stages handle well — don't burn
   *  brain cycles. The router already runs all sync stages first; this is a
   *  secondary guard. */
  function abstainHint(query){
    if (!query) return true;
    const q = String(query).trim();
    if (q.length < 3) return true;
    if (/^\d+\s*[\+\-\*\/]\s*\d+/.test(q)) return true;
    if (/^time\s+(?:in|at)\b/i.test(q)) return true;
    if (/^\d+\s*[a-z]+\s+(?:in|to)\s+[a-z]+$/i.test(q)) return true;
    return false;
  }

  /** Single call into the brain → BrainPlan. Times out at 1500ms so a slow
   *  brain never blocks the SERP. */
  async function _plan(query){
    if (!impl || !warm) return null;
    try {
      const racer = impl.planTurn(query, turnHistory.slice(-RECENT_TURNS));
      const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error('brain-timeout')), 1500));
      const plan = await Promise.race([racer, timeout]);
      if (!plan || typeof plan !== 'object') return null;
      return plan;
    } catch {
      // Don't permanently warm-flip on a single timeout — only on impl error.
      return null;
    }
  }

  /** Convert a BrainPlan into a chainrunner-compatible chain. Drops steps the
   *  brain marked can:false; their `alternative` is surfaced via the planner's
   *  `reply` (handled by the answer layer, not the chain runner). */
  function _planToChain(plan, query){
    if (!plan) return null;
    if (!Array.isArray(plan.chain) || !plan.chain.length){
      // Honest fallback: still try a web search.
      return [{ step: 'search', payload: { query } }];
    }
    const chain = [];
    for (const s of plan.chain){
      if (!s || !s.step || s.can === false) continue;
      const step = String(s.step);
      // BrainPlan steps look like "tool:foo", "search:web", "card:time", …
      // chainrunner understands 'search', 'card:<kind>', 'compute', 'speak', 'open'.
      if (step.startsWith('card:')){
        chain.push({ step, payload: { query } });
      } else if (step === 'search' || step.startsWith('search')){
        chain.push({ step: 'search', payload: { query } });
      } else if (step === 'compute' || step.startsWith('compute')){
        chain.push({ step: 'compute', payload: { expr: query } });
      } else if (step.startsWith('tool:')){
        // Tool steps don't have a generic runner; the answer layer handles the
        // suggestion. Still push a search so we have web context as backstop.
        chain.push({ step: 'search', payload: { query } });
      }
      // Other surfaces (studio/app/vision/memory/limit) — defer to answer layer.
    }
    return chain.length ? chain : [{ step: 'search', payload: { query } }];
  }

  /** Convert a BrainPlan into the ResolvedIntent shape intents.js wants. The
   *  brain's chain may name `tool:<slug>` — match that against the catalog. */
  function _planToIntent(plan, query, catalog){
    if (!plan || !catalog || !Array.isArray(catalog.tools)) return null;
    // Find the first tool:<slug> in the chain that we actually have.
    let toolSlug = null;
    if (Array.isArray(plan.chain)){
      for (const s of plan.chain){
        if (!s || !s.step || s.can === false) continue;
        const m = /^tool:([a-z0-9_-]+)/i.exec(String(s.step));
        if (m){ toolSlug = m[1]; break; }
      }
    }
    if (!toolSlug) return null;
    const tool = catalog.tools.find((t) => t.slug === toolSlug);
    if (!tool) return null;
    return {
      kind: 'brain',
      slug: tool.slug,
      tool,
      params: plan.params || {},
      confidence: 0.75,
      title: tool.name,
      icon: '✨',
      inputType: tool.inputType || 'none',
      reasoning: plan.reply || plan.goal || '',
    };
  }

  /** chainrunner consumer. Returns a chain (never null) so the runner always
   *  has at least one step to execute. */
  async function planTurn(q, ctx){  // eslint-disable-line no-unused-vars
    if (!impl || !warm || abstainHint(q)){
      return [{ step: 'search', payload: { query: q } }];
    }
    const plan = await _plan(q);
    const chain = _planToChain(plan, q);
    // Track the turn so multi-turn context works.
    if (plan && plan.reply){
      turnHistory.push({ role: 'user', text: q });
      turnHistory.push({ role: 'assistant', text: plan.reply });
      while (turnHistory.length > RECENT_TURNS * 2) turnHistory.shift();
    }
    return chain || [{ step: 'search', payload: { query: q } }];
  }

  /** intents.js consumer. Returns null when the brain can't pick a tool —
   *  the router then falls through to web search. */
  async function route(query, catalog, context){  // eslint-disable-line no-unused-vars
    if (!impl || !warm || abstainHint(query)) return null;
    const plan = await _plan(query);
    return _planToIntent(plan, query, catalog);
  }

  /** Expose the last plan for the answer layer (so AI Overview can use the
   *  brain's `reply` + cite the chain it ran). Read-only snapshot. */
  let lastPlan = null;
  async function planAndCache(query){
    const plan = await _plan(query);
    if (plan) lastPlan = { query, plan, ts: Date.now() };
    return plan;
  }
  function getLastPlan(){ return lastPlan; }

  window.oioxoBrainBridge = {
    register, isAvailable, abstainHint,
    planTurn, route,
    planAndCache, getLastPlan,
  };
})();
