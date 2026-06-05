/**
 * Operator application — turns the structured operators that
 * `operators.js` parses into actual downstream filtering / ranking
 * behaviour across the pipeline.
 *
 *   applyToWebResults(webResults, operators)  — already filters URL-shape
 *                                                but we add stricter phrase + token enforcement
 *   applyToCatalog(toolCandidates, operators)  — restrict to filetype-matching tools
 *   applyToBandit(slug, operators)             — record observed operator usage
 *
 * Exposes window.oioxoOperatorsApply = { applyToWebResults, applyToCatalog }.
 */
(function(){
  'use strict';
  if (typeof window === 'undefined') return;
  if (window.oioxoOperatorsApply) return;

  function applyToWebResults(webResults, operators){
    if (!webResults || !Array.isArray(webResults.results) || !operators) return webResults;
    let r = webResults.results;
    // Phrase enforcement — every phrase must appear in title or snippet.
    if (operators.phrases && operators.phrases.length){
      r = r.filter((res) => {
        const blob = ((res.title || '') + ' ' + (res.snippet || '')).toLowerCase();
        return operators.phrases.every((p) => blob.includes(p.toLowerCase()));
      });
    }
    // Excluded tokens — case-insensitive whole-word.
    if (operators.excludes && operators.excludes.length){
      r = r.filter((res) => {
        const blob = ((res.title || '') + ' ' + (res.snippet || '')).toLowerCase();
        return !operators.excludes.some((x) => new RegExp('\\b' + x.toLowerCase() + '\\b').test(blob));
      });
    }
    return Object.assign({}, webResults, { results: r });
  }

  function applyToCatalog(candidates, operators){
    if (!candidates || !operators) return candidates;
    let out = candidates;
    // filetype: — boost tools that match the requested file extension.
    if (operators.filetypes && operators.filetypes.length){
      const ext = operators.filetypes[0].toLowerCase();
      out = candidates.map((c) => {
        const t = c.tool || c;
        const matchesIn = t.formatIn === ext;
        const matchesOut = t.formatOut === ext;
        const slugMatch = String(t.slug || '').toLowerCase().includes(ext);
        if (matchesIn || matchesOut || slugMatch){
          return Object.assign({}, c, { score: (c.score || 0) * 1.5 });
        }
        return c;
      }).sort((a, b) => (b.score || 0) - (a.score || 0));
    }
    // Excluded tokens — drop tools whose name contains them.
    if (operators.excludes && operators.excludes.length){
      out = out.filter((c) => {
        const t = c.tool || c;
        const blob = ((t.name || '') + ' ' + (t.slug || '')).toLowerCase();
        return !operators.excludes.some((x) => blob.includes(x.toLowerCase()));
      });
    }
    return out;
  }

  /** Was a search performed with operators? Useful for analytics. */
  function summarize(operators){
    if (!operators) return null;
    const parts = [];
    if (operators.site && operators.site.length) parts.push('site:' + operators.site.length);
    if (operators.excludeSites && operators.excludeSites.length) parts.push('-site:' + operators.excludeSites.length);
    if (operators.filetypes && operators.filetypes.length) parts.push('filetype:' + operators.filetypes.length);
    if (operators.phrases && operators.phrases.length) parts.push('"phrase":' + operators.phrases.length);
    if (operators.excludes && operators.excludes.length) parts.push('-token:' + operators.excludes.length);
    if (operators.ranges && operators.ranges.length) parts.push('range:' + operators.ranges.length);
    return parts.join(' ');
  }

  window.oioxoOperatorsApply = { applyToWebResults, applyToCatalog, summarize };
})();
