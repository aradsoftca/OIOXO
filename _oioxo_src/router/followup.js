/**
 * Conversational follow-up — turns a single-word follow-up into a full
 * query by looking at the previous turn in memory.
 *
 *   turn n-1: "compress pdf"
 *   turn n:   "jpeg"                → expand to "compress jpeg"
 *
 *   turn n-1: "weather in tokyo"
 *   turn n:   "kyoto"               → expand to "weather in kyoto"
 *
 *   turn n-1: "convert png to webp"
 *   turn n:   "avif"                → expand to "convert png to avif"
 *
 * The logic is conservative — only expand when the current query is short
 * (1-2 tokens) AND none of those tokens already match the previous query's
 * operation verb. The original query stays in `originalQuery` so the
 * renderer can show "Did you mean: compress jpeg?".
 *
 * Exposes window.oioxoFollowup = { expand, classify }.
 */
(function(){
  'use strict';
  if (typeof window === 'undefined') return;
  if (window.oioxoFollowup) return;

  // Operation verbs that signal a complete query — if we see one in the
  // current query, no expansion is needed.
  const ACTION_VERBS = new Set([
    'convert','compress','resize','rotate','crop','flip','merge','split',
    'rename','watermark','remove','add','extract','translate','generate',
    'create','make','encode','decode','blur','sharpen','format','combine',
    'check','calculate','find','search','solve','play','transcribe','open',
  ]);

  // Card command words. When the current query STARTS with one of these,
  // it's a brand-new query (definition, time, news, etc.) — never expand.
  const CARD_PREFIXES = new Set([
    'define','definition','meaning',
    'time','clock','timezone',
    'news','headline','headlines',
    'translate','say',
    'what','how','when','where','who','why','which',
    'price','stock','crypto',
    'weather','forecast',
    'latest','breaking','current','live',
  ]);

  function tokenize(s){
    return String(s || '').toLowerCase().split(/\s+/).filter(Boolean);
  }

  /** Classify whether `currentQuery` is a follow-up to the prior turn. */
  function classify(currentQuery, priorQuery){
    if (!currentQuery || !priorQuery) return { isFollowup: false };
    const cur = tokenize(currentQuery);
    const prior = tokenize(priorQuery);
    if (!cur.length || !prior.length) return { isFollowup: false };
    if (cur.length > 2) return { isFollowup: false };
    // Skip if the user already typed a verb — it's a fresh query, not a follow-up.
    if (cur.some((t) => ACTION_VERBS.has(t))) return { isFollowup: false };
    // Skip if the query STARTS with a card-command word ("define", "time",
    // "news", "what", "how", etc.) — those launch a new intent.
    if (CARD_PREFIXES.has(cur[0])) return { isFollowup: false };
    // Skip if every token already appears in the prior query (it's just a repeat).
    if (cur.every((t) => prior.includes(t))) return { isFollowup: false };
    return { isFollowup: true, verb: prior.find((t) => ACTION_VERBS.has(t)) || null };
  }

  /** Expand a follow-up query against the prior turn. Returns the expanded
   *  string, or null when no expansion applies. */
  function expand(currentQuery, priorQuery){
    const cls = classify(currentQuery, priorQuery);
    if (!cls.isFollowup) return null;
    const cur = tokenize(currentQuery);
    const prior = tokenize(priorQuery);
    const verbIdx = prior.findIndex((t) => ACTION_VERBS.has(t));

    // Case A: "convert X to Y" pattern → swap the target after "to".
    const toIdx = prior.indexOf('to');
    if (toIdx > 0 && toIdx < prior.length - 1 && cur.length === 1){
      return prior.slice(0, toIdx + 1).concat(cur).join(' ');
    }
    // Case B: prior had a verb at front. Replace nouns after verb with cur.
    if (verbIdx >= 0){
      return [prior[verbIdx], ...cur].join(' ');
    }
    // Case C: "X in Y" pattern → swap Y.
    const inIdx = prior.indexOf('in');
    if (inIdx > 0 && inIdx < prior.length - 1 && cur.length === 1){
      return prior.slice(0, inIdx + 1).concat(cur).join(' ');
    }
    // Default — prepend the prior context (least confident).
    return prior.slice(0, -cur.length || prior.length).concat(cur).join(' ');
  }

  window.oioxoFollowup = { expand, classify };
})();
