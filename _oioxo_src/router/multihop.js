/**
 * Multi-hop reasoning — when the user asks a comparison or compound
 * question, run multiple lookups in parallel and synthesise a comparison
 * card.
 *
 *   detect(query) → { kind: 'compare' | 'compound', entities: [...] }
 *   compare(entities) → side-by-side comparison card
 *
 * Exposes window.oioxoMultihop = { detect, compare, parsePattern }.
 */
(function(){
  'use strict';
  if (typeof window === 'undefined') return;
  if (window.oioxoMultihop) return;

  const PATTERNS = [
    /^(?:compare|compares?|comparison)\s+(.+?)\s+(?:and|vs|versus|with|to)\s+(.+?)\??$/i,
    /^(.+?)\s+(?:vs|versus|or|compared\s+to)\s+(.+?)\??$/i,
    /^(?:difference\s+between)\s+(.+?)\s+and\s+(.+?)\??$/i,
  ];

  function detect(query){
    if (!query) return null;
    const s = String(query).trim();
    for (const p of PATTERNS){
      const m = s.match(p);
      if (m && m[1] && m[2] && m[1].length >= 2 && m[2].length >= 2){
        return { kind: 'compare', entities: [m[1].trim(), m[2].trim()] };
      }
    }
    return null;
  }

  function parsePattern(q){ return detect(q); }

  /** Run factcard.lookup() for both entities in parallel and merge. */
  async function compare(entities){
    if (!entities || entities.length < 2) return null;
    if (!window.oioxoFactcard || !window.oioxoFactcard.lookup) return null;
    const [a, b] = await Promise.all([
      window.oioxoFactcard.lookup(entities[0]),
      window.oioxoFactcard.lookup(entities[1]),
    ]);
    if (!a && !b) return null;
    return {
      kind: 'compare',
      title: entities[0] + ' vs ' + entities[1],
      icon: '⚖',
      confidence: 0.85,
      left: a && { title: a.title, subtitle: a.description, extract: a.extract, thumb: a.thumbnail, url: a.url },
      right: b && { title: b.title, subtitle: b.description, extract: b.extract, thumb: b.thumbnail, url: b.url },
      summary: 'Side-by-side comparison',
      citation: { source: 'wikipedia', url: 'https://en.wikipedia.org/wiki/Special:Search?search=' + encodeURIComponent(entities[0] + ' ' + entities[1]) },
      inputType: 'none',
    };
  }

  async function tryCard(query){
    const d = detect(query);
    if (!d) return null;
    return await compare(d.entities);
  }

  window.oioxoMultihop = { detect, compare, parsePattern, tryCard };
})();
