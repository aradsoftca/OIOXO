/**
 * Freshness labels — produces human-readable "indexed N days ago" strings
 * for web results and card content. Time-based ranking helper too.
 *
 *   label(timestamp)         → "today" / "yesterday" / "3 days ago" / "Jan 2024"
 *   bias(timestamp, query)   → 0.5..1.5 score multiplier when query implies recency
 *   isFreshness(query)       → query mentions "latest" / "today" / "this week"
 *
 * Exposes window.oioxoFreshness = { label, bias, isFreshness }.
 */
(function(){
  'use strict';
  if (typeof window === 'undefined') return;
  if (window.oioxoFreshness) return;

  function label(timestamp){
    if (!timestamp) return '';
    const ts = (typeof timestamp === 'number') ? timestamp : (new Date(timestamp).getTime());
    if (!isFinite(ts)) return '';
    const ageMs = Date.now() - ts;
    const day = 24 * 3600 * 1000;
    if (ageMs < 60 * 1000) return 'just now';
    if (ageMs < 3600 * 1000) return Math.floor(ageMs / 60000) + ' min ago';
    if (ageMs < day) return Math.floor(ageMs / 3600000) + ' h ago';
    if (ageMs < 2 * day) return 'yesterday';
    if (ageMs < 7 * day) return Math.floor(ageMs / day) + ' days ago';
    if (ageMs < 30 * day) return Math.floor(ageMs / (7 * day)) + ' weeks ago';
    if (ageMs < 365 * day) return Math.floor(ageMs / (30 * day)) + ' months ago';
    return Math.floor(ageMs / (365 * day)) + ' years ago';
  }

  function isFreshness(query){
    if (!query) return false;
    return /\b(?:latest|recent|today|this\s+week|this\s+month|this\s+year|breaking|live|now|currently)\b/i.test(query);
  }

  function bias(timestamp, query){
    if (!timestamp || !isFreshness(query)) return 1;
    const ts = (typeof timestamp === 'number') ? timestamp : (new Date(timestamp).getTime());
    if (!isFinite(ts)) return 1;
    const ageMs = Date.now() - ts;
    const day = 24 * 3600 * 1000;
    if (ageMs < day) return 1.5;
    if (ageMs < 7 * day) return 1.3;
    if (ageMs < 30 * day) return 1.1;
    if (ageMs > 365 * day) return 0.7;
    return 1;
  }

  window.oioxoFreshness = { label, bias, isFreshness };
})();
