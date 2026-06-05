/**
 * Query suggestions — autocomplete as the user types. Surfaces a small
 * ranked list of completions drawn from:
 *
 *   1. Conversational memory   — queries from this session (highest weight)
 *   2. Tool-use history        — slugs the user has launched recently
 *   3. Catalog keywords        — tool names + operation verbs + extra kws
 *   4. Top-volume completions  — popular catalog keywords by frequency
 *
 * Each source is weighted; results are merged + deduped + capped at `limit`.
 * The search box can render this as a dropdown without paying the cost of
 * a full resolve() per keystroke.
 *
 * Exposes window.oioxoSuggest = { suggest }.
 */
(function(){
  'use strict';
  if (typeof window === 'undefined') return;
  if (window.oioxoSuggest) return;

  const WEIGHTS = {
    memory: 5,    // very recent queries this session — strong signal
    history: 4,   // recently-used tools — strong signal
    catalogExact: 3,
    catalogPrefix: 2,
    catalogContains: 1,
  };

  function prefixMatch(q, candidate){
    return candidate.toLowerCase().startsWith(q.toLowerCase());
  }
  function containsMatch(q, candidate){
    return candidate.toLowerCase().indexOf(q.toLowerCase()) >= 0;
  }

  function fromMemory(q){
    if (!window.oioxoMemory || !window.oioxoMemory.recent) return [];
    const out = [];
    for (const e of window.oioxoMemory.recent(10)){
      if (!e || !e.query) continue;
      if (e.query.toLowerCase() === q.toLowerCase()) continue;
      if (prefixMatch(q, e.query) || containsMatch(q, e.query)){
        out.push({ text: e.query, weight: WEIGHTS.memory, source: 'memory' });
      }
    }
    return out;
  }
  function fromHistory(q, catalog){
    if (!window.oioxoHistory || !window.oioxoHistory.recent || !catalog) return [];
    const out = [];
    for (const h of window.oioxoHistory.recent(10)){
      const tool = catalog.tools.find((t) => t.slug === h.slug);
      if (!tool) continue;
      if (prefixMatch(q, tool.name) || containsMatch(q, tool.name)){
        out.push({ text: tool.name, weight: WEIGHTS.history, source: 'history', slug: tool.slug });
      }
    }
    return out;
  }
  function fromCatalog(q, catalog){
    if (!catalog || !catalog.tools) return [];
    const out = [];
    const qLower = q.toLowerCase();
    const seen = new Set();
    // First pass: tool names that are exact or prefix matches.
    for (const t of catalog.tools){
      if (!t.name) continue;
      const name = t.name;
      const nameLower = name.toLowerCase();
      if (nameLower === qLower) continue;
      let weight = 0;
      if (prefixMatch(q, name)) weight = WEIGHTS.catalogPrefix;
      else if (containsMatch(q, name)) weight = WEIGHTS.catalogContains;
      if (weight && !seen.has(nameLower)){
        seen.add(nameLower);
        out.push({ text: name, weight, source: 'catalog-name', slug: t.slug });
      }
    }
    // Second pass: keyword exact matches surface as "tool · keyword".
    for (const t of catalog.tools){
      for (const kw of (t.keywords || [])){
        const kwLower = String(kw || '').toLowerCase();
        if (!kwLower || seen.has(kwLower)) continue;
        if (prefixMatch(q, kwLower)){
          seen.add(kwLower);
          out.push({ text: kwLower, weight: WEIGHTS.catalogPrefix, source: 'catalog-kw', slug: t.slug });
        }
      }
    }
    return out;
  }

  /** Top-level: assemble + dedup + sort + cap. */
  function suggest(q, catalog, opts){
    opts = opts || {};
    const limit = Math.max(1, Math.min(12, opts.limit || 6));
    const qLower = (q || '').trim();
    if (qLower.length < 1) return [];
    if (qLower.length > 80) return [];
    const all = [
      ...fromMemory(qLower),
      ...fromHistory(qLower, catalog),
      ...fromCatalog(qLower, catalog),
    ];
    if (!all.length) return [];
    // Dedup by text, keeping highest weight.
    const map = new Map();
    for (const s of all){
      const key = s.text.toLowerCase();
      const cur = map.get(key);
      if (!cur || cur.weight < s.weight) map.set(key, s);
    }
    return Array.from(map.values())
      .sort((a, b) => b.weight - a.weight)
      .slice(0, limit);
  }

  window.oioxoSuggest = { suggest };
})();
