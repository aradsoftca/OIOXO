/**
 * Federated catalog search — lets the SERP query MULTIPLE catalog sources
 * in parallel and merge their results. Use cases:
 *
 *   - Enterprise: an internal /api/internal-catalog provides company tools
 *     alongside the public oioxo catalog
 *   - Mirrors: a secondary oioxo deployment contributes its localised tools
 *   - Community: user-curated tool packs from public GitHub repos
 *
 * Each source provides:
 *   { name, query(rawQ, context) → Promise<{ tools, intent? }> | null }
 *
 * The federation layer:
 *   - calls every registered source in parallel
 *   - enforces a per-source wall-clock budget (default 500ms)
 *   - tags returned cards with their source name
 *   - merges into a unified candidate list the SERP can rank
 *   - logs per-source latency for the metrics layer
 *
 * Exposes window.oioxoFederation = { register, unregister, list, search,
 *                                     stats }.
 */
(function(){
  'use strict';
  if (typeof window === 'undefined') return;
  if (window.oioxoFederation) return;

  const sources = new Map();
  const sourceStats = new Map();
  const DEFAULT_BUDGET_MS = 500;

  function register(name, fn, opts){
    if (!name || typeof fn !== 'function') return false;
    sources.set(name, { fn, budgetMs: (opts && opts.budgetMs) || DEFAULT_BUDGET_MS, weight: (opts && opts.weight) || 1 });
    if (!sourceStats.has(name)) sourceStats.set(name, { calls: 0, errors: 0, lastMs: 0, totalMs: 0 });
    return true;
  }

  function unregister(name){ sources.delete(name); }
  function list(){ return Array.from(sources.keys()); }

  /** Run a single source under its budget. Records latency. */
  async function callSource(name, rawQ, context){
    const s = sources.get(name);
    if (!s) return null;
    const stat = sourceStats.get(name);
    const t0 = (typeof performance !== 'undefined') ? performance.now() : Date.now();
    stat.calls++;
    try {
      const result = await Promise.race([
        Promise.resolve(s.fn(rawQ, context)),
        new Promise((res) => setTimeout(() => res({ tools: [], timeout: true }), s.budgetMs)),
      ]);
      const dt = ((typeof performance !== 'undefined') ? performance.now() : Date.now()) - t0;
      stat.lastMs = Math.round(dt); stat.totalMs += dt;
      return result || null;
    } catch (e) {
      stat.errors++;
      return null;
    }
  }

  /** Query every registered source in parallel; return merged candidate
   *  list tagged with source names. The caller (SERP) re-ranks. */
  async function search(rawQ, context){
    if (!sources.size) return { sources: [], tools: [], intents: [] };
    const t0 = (typeof performance !== 'undefined') ? performance.now() : Date.now();
    const names = Array.from(sources.keys());
    const settled = await Promise.all(names.map((n) => callSource(n, rawQ, context)));
    const mergedTools = [];
    const intents = [];
    const perSource = [];
    for (let i = 0; i < names.length; i++){
      const name = names[i];
      const res = settled[i];
      const weight = sources.get(name).weight;
      if (!res) { perSource.push({ name, tools: 0, intent: null, error: true }); continue; }
      const tools = Array.isArray(res.tools) ? res.tools : [];
      perSource.push({ name, tools: tools.length, intent: res.intent ? res.intent.kind : null, timeout: !!res.timeout });
      for (const tool of tools){
        mergedTools.push(Object.assign({}, tool, { source: name, _federationWeight: weight }));
      }
      if (res.intent){
        intents.push(Object.assign({}, res.intent, { source: name }));
      }
    }
    const totalMs = ((typeof performance !== 'undefined') ? performance.now() : Date.now()) - t0;
    return { sources: perSource, tools: mergedTools, intents, totalMs: Math.round(totalMs) };
  }

  function stats(){
    const out = {};
    for (const [name, s] of sourceStats.entries()){
      out[name] = {
        calls: s.calls,
        errors: s.errors,
        lastMs: s.lastMs,
        avgMs: s.calls ? Math.round(s.totalMs / s.calls) : 0,
        errorRate: s.calls ? s.errors / s.calls : 0,
      };
    }
    return out;
  }

  window.oioxoFederation = { register, unregister, list, search, stats };
})();
