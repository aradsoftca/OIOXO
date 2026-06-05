/**
 * Related queries — from the local memory log (last ~10 turns), suggest
 * queries that share tokens with the current one. "People also tried" but
 * entirely on-device.
 *
 * Lightweight: token Jaccard overlap, no embeddings. Filters out exact
 * duplicates of the current query.
 *
 * Exposes window.oioxoRelated = { suggest }.
 */
(function(){
  'use strict';
  if (typeof window === 'undefined') return;
  if (window.oioxoRelated) return;

  function tokens(s){
    return String(s || '').toLowerCase().split(/\s+/).filter(Boolean);
  }

  function jaccard(a, b){
    if (!a.length || !b.length) return 0;
    const A = new Set(a); const B = new Set(b);
    let inter = 0;
    for (const x of A) if (B.has(x)) inter++;
    return inter / (A.size + B.size - inter);
  }

  function suggest(currentQuery, opts){
    opts = opts || {};
    const limit = opts.limit || 4;
    const minOverlap = opts.minOverlap || 0.2;
    if (!window.oioxoMemory || !window.oioxoMemory.recent) return [];
    const recents = window.oioxoMemory.recent(20);
    const cur = tokens(currentQuery);
    if (!cur.length) return [];
    const seen = new Set([currentQuery.toLowerCase().trim()]);
    const out = [];
    for (const turn of recents){
      const q = (turn.query || '').trim();
      if (!q) continue;
      const k = q.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      const score = jaccard(cur, tokens(q));
      if (score < minOverlap) continue;
      out.push({ query: q, score, intent: turn.intent && turn.intent.kind || null });
      if (out.length >= limit * 2) break; // small buffer for sort
    }
    return out.sort((a, b) => b.score - a.score).slice(0, limit);
  }

  window.oioxoRelated = { suggest };
})();
