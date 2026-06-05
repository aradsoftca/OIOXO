/**
 * Capability graph — turns the catalog into a directed adjacency structure
 * where an edge from tool A to tool B means "A's output format is a valid
 * input format for B". Backs the multi-step planner.
 *
 * Built lazily on first use and memoized against the catalog version, so
 * regenerating the catalog automatically rebuilds the graph.
 *
 * Exposes window.oioxoCapabilityGraph = { build, byOperation, byFormatGroup,
 *   feeds, downstream, sourcesOf, all }.
 */
(function(){
  'use strict';
  if (typeof window === 'undefined') return;
  if (window.oioxoCapabilityGraph) return;

  let cached = null;       // { version, graph }

  function build(catalog){
    if (!catalog || !catalog.tools) return null;
    if (cached && cached.version === catalog.version) return cached.graph;

    const byOperation = {};      // verb → [tool, ...]
    const byFormatGroup = {};    // 'video' / 'audio' / 'image' / 'doc' → [tools]
    const byFormatIn = {};       // 'mp4' → [tools that accept mp4]
    const byFormatOut = {};      // 'avi' → [tools that produce avi]
    const byCategory = {};       // 'pdftools' → [tools]
    const byAppType = {};        // 'ai' → [tools] (apps)
    const byInputType = {};      // 'file' / 'text' / ... → [tools]
    const tools = catalog.tools;
    for (const t of tools){
      if (t.category) (byCategory[t.category] = byCategory[t.category] || []).push(t);
      if (t.inputType) (byInputType[t.inputType] = byInputType[t.inputType] || []).push(t);
      if (t.appType) (byAppType[t.appType] = byAppType[t.appType] || []).push(t);
      if (t.formatGroup) (byFormatGroup[t.formatGroup] = byFormatGroup[t.formatGroup] || []).push(t);
      if (t.formatIn) (byFormatIn[t.formatIn] = byFormatIn[t.formatIn] || []).push(t);
      if (t.formatOut) (byFormatOut[t.formatOut] = byFormatOut[t.formatOut] || []).push(t);
      for (const op of (t.operations || [])) {
        (byOperation[op] = byOperation[op] || []).push(t);
      }
    }

    // Adjacency: from-tool slug → [to-tools]. Edge exists when from.formatOut
    // matches to.formatIn or to.formatGroup contains from.formatOut.
    const adjacency = new Map();
    for (const from of tools){
      const out = from.formatOut;
      if (!out) continue;
      const next = [];
      // Exact format match
      for (const to of (byFormatIn[out] || [])){
        if (to.slug !== from.slug) next.push(to);
      }
      // Group match (e.g. from outputs 'wav', goes into any audio-converter)
      const group = catalog.formatGroups ? lookupFormatGroup(out, catalog.formatGroups) : null;
      if (group && byFormatGroup[group]) {
        for (const to of byFormatGroup[group]){
          if (to.slug !== from.slug && !next.includes(to)) next.push(to);
        }
      }
      if (next.length) adjacency.set(from.slug, next);
    }

    const graph = {
      byOperation, byFormatGroup, byFormatIn, byFormatOut, byCategory, byAppType, byInputType,
      adjacency,
      all: tools,
      version: catalog.version,
    };
    cached = { version: catalog.version, graph };
    return graph;
  }

  function lookupFormatGroup(ext, formatGroups){
    ext = (ext || '').toLowerCase();
    for (const [g, list] of Object.entries(formatGroups || {})) {
      if (list.includes(ext)) return g;
    }
    return null;
  }

  /** Tools whose `formatIn` is fed by the given tool's `formatOut`. */
  function downstream(catalog, slug){
    const g = build(catalog);
    if (!g) return [];
    return g.adjacency.get(slug) || [];
  }

  /** Tools whose `formatOut` matches the given format (or its group). */
  function sourcesOf(catalog, format){
    const g = build(catalog);
    if (!g) return [];
    const exact = g.byFormatOut[format] || [];
    const group = lookupFormatGroup(format, catalog.formatGroups || {});
    if (!group) return exact;
    const groupMatches = (g.byFormatGroup[group] || []).filter((t) => t.formatOut && t.formatOut !== format);
    const merged = exact.slice();
    for (const t of groupMatches) if (!merged.includes(t)) merged.push(t);
    return merged;
  }

  function byOperation(catalog, verb){ const g = build(catalog); return g ? (g.byOperation[verb] || []) : []; }
  function byFormatGroup(catalog, group){ const g = build(catalog); return g ? (g.byFormatGroup[group] || []) : []; }
  function feeds(catalog, slug){ return downstream(catalog, slug); }

  /** Capability negotiation API — public summary of what oioxo can do.
   *  Useful for UIs that need to ask "what tools are available?" without
   *  walking the whole catalog. */
  function capabilities(catalog){
    const g = build(catalog);
    if (!g) return null;
    return {
      version: catalog.version,
      counts: {
        tools: catalog.tools.length,
        operations: Object.keys(g.byOperation).length,
        formats: Object.keys(g.byFormatIn).length + Object.keys(g.byFormatOut).length,
        apps: (catalog.tools || []).filter((t) => t.appType).length,
        studios: (catalog.tools || []).filter((t) => t.category === 'studios').length,
      },
      operations: Object.keys(g.byOperation).sort(),
      formatGroups: Object.keys(g.byFormatGroup).sort(),
      inputTypes: Object.keys(g.byInputType).sort(),
    };
  }

  window.oioxoCapabilityGraph = { build, byOperation, byFormatGroup, feeds, downstream, sourcesOf, capabilities, lookupFormatGroup };
})();
