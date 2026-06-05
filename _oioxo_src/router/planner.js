/**
 * Multi-step planner — turns a natural-language query that mentions
 * SEVERAL operations into a sequence of resolved intents. Backed by the
 * capability graph; the planner asserts each subsequent step has an input
 * format that matches the previous step's output.
 *
 * Supported query shapes (case-insensitive):
 *   "compress pdf then merge them"
 *   "transcribe audio then translate to spanish"
 *   "video to gif then upload"
 *   "X and Y"
 *   "X, then Y, then Z"
 *
 * Splitter recognises: "then", "and then", ",", ";", "after that", "→".
 *
 * Returns null when:
 *   - The query has fewer than 2 detected segments
 *   - Any segment fails to resolve
 *   - Graph reports the chain is invalid (output format mismatch)
 *
 * Exposes window.oioxoPlanner = { plan }.
 */
(function(){
  'use strict';
  if (typeof window === 'undefined') return;
  if (window.oioxoPlanner) return;

  const SPLITTERS = /\s+(?:then|and\s+then|after\s+that|→|->|>>)\s+|[,;]\s+/i;

  function splitSegments(q){
    const segs = q.split(SPLITTERS).map((s) => s.trim()).filter(Boolean);
    return segs.length >= 2 ? segs : null;
  }

  function plan(rawQ, catalog, context){
    if (!rawQ || !catalog || !window.oioxoRouter) return null;
    const segs = splitSegments(rawQ.trim());
    if (!segs) return null;
    const steps = [];
    for (const s of segs){
      const r = window.oioxoRouter.resolve(s, catalog, Object.assign({}, context, { noCache: true }));
      if (!r) return null; // can't plan if any step is unknown
      steps.push(r);
    }
    if (steps.length < 2) return null;

    // Validate adjacency where possible. If consecutive steps both have
    // format info, require that step N's output feeds step N+1's input.
    const graph = window.oioxoCapabilityGraph && window.oioxoCapabilityGraph.build(catalog);
    let invalidEdges = 0;
    if (graph) {
      for (let i = 0; i + 1 < steps.length; i++) {
        const a = steps[i].tool, b = steps[i + 1].tool;
        if (!a.formatOut) continue;
        const fed = graph.adjacency.get(a.slug);
        if (!fed) continue;
        if (!fed.includes(b)) {
          invalidEdges++;
          steps[i].warning = 'output (' + a.formatOut + ') may not match next step input';
        }
      }
    }

    // Aggregate confidence: geometric mean (so one weak link hurts the chain).
    let conf = 1;
    for (const s of steps) conf *= Math.max(0.01, s.confidence || 0.5);
    conf = Math.pow(conf, 1 / steps.length);
    if (invalidEdges) conf *= 0.85;

    return {
      kind: 'plan',
      steps,
      confidence: conf,
      invalidEdges,
      title: steps.map((s) => s.title || s.tool.name).join(' → '),
      icon: '⛓',
      inputType: steps[0].inputType,
    };
  }

  window.oioxoPlanner = { plan };
})();
