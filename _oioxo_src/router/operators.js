/**
 * Search-operator parser — extracts power-user operators from the raw
 * query before the rewriter sees it. Mirrors Google's behaviour:
 *
 *   site:domain.com           — restrict to a domain
 *   -site:domain.com          — exclude a domain
 *   filetype:pdf  (or ext:)   — restrict file type
 *   "exact phrase"            — phrase must appear verbatim
 *   -exclude                  — exclude a token
 *   2024..2026                — numeric range
 *
 * Returns:
 *   { cleanQuery, operators: { site[], excludeSites[], filetypes[], phrases[],
 *                              excludes[], ranges[] } }
 *
 * Downstream consumers (webresults.js, ranker.js) honour these operators;
 * the catalog tool resolver mostly ignores them (operators target the web).
 *
 * Exposes window.oioxoOperators = { parse }.
 */
(function(){
  'use strict';
  if (typeof window === 'undefined') return;
  if (window.oioxoOperators) return;

  const OP_SITE = /(-)?site:([\w.-]+)/g;
  const OP_FILETYPE = /\b(filetype|ext):([a-z0-9]+)/ig;
  const OP_PHRASE = /"([^"]+)"/g;
  const OP_EXCLUDE = /(^|\s)-([\w]{2,})/g;
  const OP_RANGE = /(\d+)\.\.(\d+)/g;

  function parse(rawQ){
    if (!rawQ) return { cleanQuery: '', operators: emptyOps() };
    let q = String(rawQ);
    const ops = emptyOps();

    // 1. Phrases first — they often contain other operator-like chars.
    q = q.replace(OP_PHRASE, (m, p) => {
      ops.phrases.push(p.trim());
      return ' '; // strip but keep word boundary
    });

    // 2. Site / exclude-site.
    q = q.replace(OP_SITE, (m, neg, host) => {
      if (neg) ops.excludeSites.push(host.toLowerCase());
      else ops.site.push(host.toLowerCase());
      return ' ';
    });

    // 3. filetype: / ext:
    q = q.replace(OP_FILETYPE, (m, _kind, ext) => {
      ops.filetypes.push(ext.toLowerCase());
      return ' ';
    });

    // 4. Numeric range.
    q = q.replace(OP_RANGE, (m, a, b) => {
      const lo = parseFloat(a), hi = parseFloat(b);
      if (Number.isFinite(lo) && Number.isFinite(hi) && hi >= lo){
        ops.ranges.push({ lo, hi });
      }
      return ' ';
    });

    // 5. Exclude tokens.
    q = q.replace(OP_EXCLUDE, (m, pre, tok) => {
      ops.excludes.push(tok.toLowerCase());
      return pre || ' ';
    });

    const cleanQuery = q.replace(/\s+/g, ' ').trim();
    return { cleanQuery, operators: ops };
  }

  function emptyOps(){
    return { site: [], excludeSites: [], filetypes: [], phrases: [], excludes: [], ranges: [] };
  }

  function hasAny(ops){
    if (!ops) return false;
    for (const k of Object.keys(ops)){
      if (Array.isArray(ops[k]) && ops[k].length) return true;
    }
    return false;
  }

  window.oioxoOperators = { parse, hasAny };
})();
