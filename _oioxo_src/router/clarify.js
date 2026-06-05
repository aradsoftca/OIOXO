/**
 * Clarify — when no card fired and the catalog match is low-confidence,
 * surface a "did you mean" choice card instead of guessing wrong.
 *
 *   shouldClarify(intent, candidates) → boolean
 *   build(query, candidates, opts) → clarify intent card
 *
 * Exposes window.oioxoClarify = { shouldClarify, build }.
 */
(function(){
  'use strict';
  if (typeof window === 'undefined') return;
  if (window.oioxoClarify) return;

  function shouldClarify(intent, candidates){
    if (!intent || !candidates || candidates.length < 2) return false;
    if (intent.confidence != null && intent.confidence < 0.55){
      // Multiple top candidates with similar scores → ambiguous.
      const top = candidates.slice(0, 4);
      if (top.length >= 2 && top[0].score - top[top.length - 1].score < 1.5) return true;
    }
    return false;
  }

  function build(query, candidates, opts){
    opts = opts || {};
    const top = candidates.slice(0, 4);
    return {
      kind: 'clarify',
      title: '"' + query + '" could mean…',
      icon: '🤔',
      confidence: 0.5,
      options: top.map((c) => ({
        slug: (c.tool && c.tool.slug) || c.slug,
        name: (c.tool && c.tool.name) || c.name,
        url: (c.tool && c.tool.url) || c.url,
        category: (c.tool && c.tool.category) || c.category,
        score: c.score,
      })),
      summary: 'Pick one of these or refine your query',
      inputType: 'none',
    };
  }

  window.oioxoClarify = { shouldClarify, build };
})();
