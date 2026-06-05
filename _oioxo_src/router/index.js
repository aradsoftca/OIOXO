/**
 * Inverted index — built once per catalog version, then reused for every
 * resolve. Maps every bigram + token in tool name/keywords/synonyms to the
 * set of tool slugs that contain it.
 *
 * Why: the live ranker walks the whole catalog (~420 tools) for every
 * query. With a precomputed bigram index, candidate generation drops to
 * O(query-tokens × avg-bucket-size) ≈ sub-millisecond even at 10k tools.
 *
 * The index is a pure data structure — no behavior change for any caller;
 * use lookup(query, catalog) to get a Set<slug> of likely matches, then
 * feed those candidates back through the real scoring fn for accuracy.
 *
 * Exposes window.oioxoIndex = { build, lookup, version, stats }.
 */
(function(){
  'use strict';
  if (typeof window === 'undefined') return;
  if (window.oioxoIndex) return;

  let index = null;
  let builtForVersion = null;

  function tokens(str){
    if (!str) return [];
    return String(str).toLowerCase()
      .replace(/[^a-z0-9 ]+/g, ' ')
      .split(/\s+/).filter(Boolean);
  }

  function bigrams(token){
    if (!token || token.length < 2) return token ? [token] : [];
    const out = [];
    for (let i = 0; i < token.length - 1; i++) out.push(token.slice(i, i + 2));
    return out;
  }

  /** Build the inverted index once. Tokens get full-word entries; longer
   *  tokens (≥4 chars) also contribute bigrams so partial-match queries
   *  ("compres") still hit. Synonyms + keywords are first-class. */
  function build(catalog){
    if (!catalog || !catalog.tools) return null;
    const t0 = (typeof performance !== 'undefined') ? performance.now() : Date.now();
    const word = new Map();   // token → Set<slug>
    const bi = new Map();     // bigram → Set<slug>

    function add(slug, str){
      for (const tok of tokens(str)){
        if (!word.has(tok)) word.set(tok, new Set());
        word.get(tok).add(slug);
        if (tok.length >= 4){
          for (const b of bigrams(tok)){
            if (!bi.has(b)) bi.set(b, new Set());
            bi.get(b).add(slug);
          }
        }
      }
    }

    for (const tool of catalog.tools){
      const slug = tool.slug;
      add(slug, tool.name);
      add(slug, tool.slug.replace(/-/g, ' '));
      if (tool.category) add(slug, tool.category);
      if (Array.isArray(tool.keywords)) for (const k of tool.keywords) add(slug, k);
      if (Array.isArray(tool.synonyms)) for (const s of tool.synonyms) add(slug, s);
      if (tool.summary) add(slug, tool.summary);
    }

    index = { word, bi };
    builtForVersion = catalog.version || 'unknown';
    const dt = ((typeof performance !== 'undefined') ? performance.now() : Date.now()) - t0;
    index.buildMs = Math.round(dt);
    return index;
  }

  /** Look up candidate slugs for a query. Returns a Set so the ranker can
   *  intersect / union with other signals. Falls back to a full-catalog
   *  walk when the index isn't built yet (lazy callers). */
  function lookup(query, catalog){
    if (!index || (catalog && catalog.version && catalog.version !== builtForVersion)){
      build(catalog);
    }
    if (!index) return new Set();
    const qTokens = tokens(query);
    if (!qTokens.length) return new Set();
    const candidates = new Map(); // slug → match-strength
    for (const tok of qTokens){
      // Exact token wins big.
      const exact = index.word.get(tok);
      if (exact){
        for (const slug of exact) candidates.set(slug, (candidates.get(slug) || 0) + 3);
      }
      // Then bigram contributions for partial-match.
      if (tok.length >= 4){
        for (const b of bigrams(tok)){
          const hits = index.bi.get(b);
          if (!hits) continue;
          for (const slug of hits) candidates.set(slug, (candidates.get(slug) || 0) + 1);
        }
      }
    }
    // Return the slugs sorted by index-match score so the caller can
    // truncate to top-K before invoking the heavier scoreTool.
    return new Set([...candidates.entries()].sort((a, b) => b[1] - a[1]).map(([slug]) => slug));
  }

  function version(){ return builtForVersion; }
  function stats(){
    if (!index) return null;
    return {
      version: builtForVersion,
      buildMs: index.buildMs,
      uniqueTokens: index.word.size,
      uniqueBigrams: index.bi.size,
    };
  }

  window.oioxoIndex = { build, lookup, version, stats };
})();
