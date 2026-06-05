/**
 * Disambiguation — when a query has multiple plausible meanings, surface
 * a choice card instead of guessing wrong.
 *
 *   "jaguar"  → [animal, car, OS, framework]
 *   "apple"   → [fruit, company]
 *   "python"  → [language, snake]
 *   "mercury" → [planet, element, god, car]
 *
 * Two sources of senses:
 *   a) Catalog categories — when multiple tools across DIFFERENT categories
 *      match the same single token, we offer them as alternative meanings.
 *   b) Wikipedia disambiguation page — CORS-clean. We only fetch when
 *      catalog gave no signal and the query is a single token of ≥3 chars.
 *
 * Exposes window.oioxoDisambiguation = { detect, fetchWiki, build }.
 */
(function(){
  'use strict';
  if (typeof window === 'undefined') return;
  if (window.oioxoDisambiguation) return;

  /** Heuristic: query is a single content word? */
  function isSingleTerm(q){
    if (!q) return false;
    const t = String(q).trim().toLowerCase();
    return /^[a-z][a-z]{2,}$/.test(t);
  }

  /** Collect catalog tools matching this single token, grouped by category. */
  function detectFromCatalog(query, catalog){
    if (!catalog || !catalog.tools) return [];
    const q = String(query).toLowerCase().trim();
    const byCat = new Map();
    for (const t of catalog.tools){
      if (!t || !t.slug) continue;
      const name = String(t.name || '').toLowerCase();
      const tags = (t.keywords || []).join(' ').toLowerCase();
      if (!name.includes(q) && !tags.includes(q)) continue;
      const cat = t.category || 'misc';
      if (!byCat.has(cat)) byCat.set(cat, []);
      byCat.get(cat).push(t);
    }
    if (byCat.size < 2) return []; // need at least 2 different categories
    const senses = [];
    for (const [cat, tools] of byCat.entries()){
      senses.push({
        kind: 'catalog',
        sense: cat,
        label: cat.replace(/-/g, ' '),
        examples: tools.slice(0, 3).map((t) => ({ slug: t.slug, name: t.name, url: t.url })),
      });
    }
    return senses.slice(0, 4);
  }

  /** Public Wikipedia disambiguation lookup, CORS-clean. */
  async function fetchWiki(query){
    if (typeof fetch === 'undefined') return [];
    try {
      const url = 'https://en.wikipedia.org/w/api.php?action=query&format=json&prop=info|extracts' +
        '&exintro=1&explaintext=1&titles=' + encodeURIComponent(query + ' (disambiguation)') + '&origin=*';
      const r = await Promise.race([
        fetch(url).then((r) => r.json()),
        new Promise((res) => setTimeout(() => res(null), 600)),
      ]);
      if (!r || !r.query || !r.query.pages) return [];
      const pages = Object.values(r.query.pages);
      const out = [];
      for (const p of pages){
        const text = String(p.extract || '');
        if (!text) continue;
        const lines = text.split('\n').filter((l) => l.trim().length > 20).slice(0, 6);
        for (const line of lines){
          out.push({ kind: 'wiki', sense: 'wiki', label: line.slice(0, 80) });
        }
      }
      return out.slice(0, 6);
    } catch { return []; }
  }

  /** Top-level: try catalog first, optionally augment with Wikipedia. */
  async function detect(query, catalog, opts){
    opts = opts || {};
    if (!isSingleTerm(query)) return null;
    const fromCat = detectFromCatalog(query, catalog);
    if (fromCat.length >= 2) return { query, senses: fromCat, source: 'catalog' };
    if (opts.fetchWiki){
      const fromWiki = await fetchWiki(query);
      if (fromWiki.length >= 2) return { query, senses: fromWiki, source: 'wikipedia' };
    }
    return null;
  }

  /** Wrap detected senses in the standard intent shape. */
  function build(detection){
    if (!detection) return null;
    return {
      kind: 'disambiguation',
      title: '"' + detection.query + '" can mean…',
      icon: '🔀',
      confidence: 0.5,
      senses: detection.senses,
      summary: detection.senses.length + ' possible meanings — pick one.',
      inputType: 'none',
    };
  }

  window.oioxoDisambiguation = { detect, fetchWiki, build, isSingleTerm };
})();
