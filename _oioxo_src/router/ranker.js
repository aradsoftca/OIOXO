/**
 * Card ranker + deduper. Takes the flat list of cards every provider
 * produced for a query and:
 *   1. Deduplicates by content signature (same tool slug → keep highest priority)
 *   2. Rescores each card by:
 *        - provider priority (the existing 0-100 sidebar priority)
 *        - resolver confidence when present
 *        - history boost (recently-used tools surface higher)
 *        - tier match (Pro tools demoted for free, never hidden)
 *        - freshness penalty (cards that look stale)
 *   3. Sorts the result; preserves the original provider-priority tiebreak
 *
 * The ranker is PURE — it doesn't mutate the inputs and doesn't re-fetch.
 * It just shapes the final ordering. The caller (search.html sidebar
 * renderer or iaRouter aggregator) decides what to do with the result.
 *
 * Exposes window.oioxoRanker = { rank, score, dedup }.
 */
(function(){
  'use strict';
  if (typeof window === 'undefined') return;
  if (window.oioxoRanker) return;

  /** Score one card. Higher is better. */
  function score(card, context){
    if (!card) return 0;
    let s = typeof card.priority === 'number' ? card.priority : 50;
    // Confidence (the router emits these on its kinds): 0..1 contributes up to +30.
    if (card.intent && typeof card.intent.confidence === 'number') {
      s += card.intent.confidence * 30;
    }
    // History boost from intent.tool.slug if the tool was used recently.
    const slug = card.intent && card.intent.tool && card.intent.tool.slug;
    if (slug && window.oioxoHistory && typeof window.oioxoHistory.scoreBoost === 'function'){
      s += window.oioxoHistory.scoreBoost(slug) * 8;
    }
    // Profile / category affinity — gentle boost (0..+6) once the user has
    // a clear pattern. Square-root scaled inside profile.affinity() so a
    // dominant category doesn't bury minority results.
    const category = card.intent && card.intent.tool && card.intent.tool.category;
    if (category && window.oioxoProfile && typeof window.oioxoProfile.affinity === 'function'){
      s += window.oioxoProfile.affinity(category) * 6;
    }
    // Bookmarked queries — give the corresponding tool a small lift so
    // pinned shortcuts feel sticky.
    if (slug && window.oioxoBookmarks && typeof window.oioxoBookmarks.list === 'function'){
      try {
        if (window.oioxoBookmarks.list().some((b) => b.meta && b.meta.slug === slug)) s += 3;
      } catch {}
    }
    // Explicit feedback (👍/👎) — gentle multiplier so the user's signal
    // wins over passive history without feedback runaway.
    if (slug && window.oioxoFeedback && typeof window.oioxoFeedback.sentiment === 'function'){
      try {
        const sent = window.oioxoFeedback.sentiment(slug);
        if (sent !== 0){
          const cap = Math.max(-3, Math.min(3, sent));
          s *= 1 + cap * 0.07;
        }
      } catch {}
    }
    // Tier match. If a card's tool is 'pro' and the user is 'free', soft-demote.
    if (card.intent && card.intent.tool && card.intent.tool.tier === 'pro'){
      if (context && context.tier === 'free') s *= 0.85;
    }
    // Surface-specific tweaks. In voice / embed surfaces, prefer no-input
    // tools (since file drops aren't possible).
    if (context && (context.surface === 'voice' || context.surface === 'embed')){
      const it = card.intent && card.intent.inputType;
      if (it === 'file') s *= 0.85;
    }
    return s;
  }

  function fingerprint(card){
    // Same tool resolved twice from different providers → same fingerprint.
    if (card.intent && card.intent.tool && card.intent.tool.url) return 'tool:' + card.intent.tool.url;
    // Plan: hash the chain of slugs.
    if (card.intent && Array.isArray(card.intent.steps)){
      return 'plan:' + card.intent.steps.map((s) => s.tool && s.tool.slug || '?').join('>');
    }
    // Fallback: kind + title + priority.
    return 'k:' + (card.kind || '') + '|' + (card.title || '');
  }

  /** Keep highest-priority instance of each fingerprint; drop the rest. */
  function dedup(cards){
    if (!Array.isArray(cards) || !cards.length) return [];
    const byFp = new Map();
    for (const c of cards){
      const fp = fingerprint(c);
      const existing = byFp.get(fp);
      if (!existing || (c.priority || 0) > (existing.priority || 0)){
        byFp.set(fp, c);
      }
    }
    return Array.from(byFp.values());
  }

  /** Diversify a sorted list so no single category dominates the top-N.
   *  The first card always wins; subsequent cards demote when they share
   *  a category with the previous slot (MMR-style). We cap the demotion
   *  so identical-category clusters still rank above unrelated noise. */
  function diversify(sortedScored, opts){
    opts = opts || {};
    const window_ = opts.window || 5;          // diversify within top-N
    const penalty = opts.penalty || 0.85;       // per-repeat multiplier
    if (sortedScored.length <= 1) return sortedScored;
    const seenCats = new Map();
    const out = [];
    for (const entry of sortedScored){
      const cat = entry.card && entry.card.intent && entry.card.intent.tool && entry.card.intent.tool.category;
      let s = entry.score;
      if (cat){
        const repeats = seenCats.get(cat) || 0;
        if (out.length < window_ && repeats > 0) s = s * Math.pow(penalty, repeats);
        seenCats.set(cat, repeats + 1);
      }
      out.push({ card: entry.card, score: s });
    }
    return out.sort((a, b) => b.score - a.score);
  }

  /** Top-level: dedup + score + diversify + sort. Returns a new array. */
  function rank(cards, context){
    const unique = dedup(cards);
    const scored = unique
      .map((c) => ({ card: c, score: score(c, context) }))
      .sort((a, b) => b.score - a.score);
    const diversified = (context && context.diversify === false) ? scored : diversify(scored);
    return diversified.map((x) => x.card);
  }

  window.oioxoRanker = { rank, score, dedup, fingerprint, diversify };
})();
