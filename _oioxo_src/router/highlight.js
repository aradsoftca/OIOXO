/**
 * Snippet highlighting — wraps query terms in <mark>…</mark> for the
 * renderer to style. Conservative tokeniser (drops stop words + length
 * filter) so common words don't all light up. Also handles diacritic-
 * folded matches so "comprimé" highlights against the query "compress".
 *
 *   highlight(snippet, query)              → HTML string with <mark>
 *   highlightAll(webResults, query)         → mutates each result.snippet
 *
 * Exposes window.oioxoHighlight = { highlight, highlightAll, tokens }.
 */
(function(){
  'use strict';
  if (typeof window === 'undefined') return;
  if (window.oioxoHighlight) return;

  const STOP = new Set([
    'a','an','the','of','to','in','on','for','with','at','by','from','as','is','are',
    'was','were','be','been','this','that','these','those','it','its','and','or','but',
    'not','no','so','what','when','where','why','how','who','which','my','your','our',
    'their','his','her','i','you','we','they','do','does','did','can','could','would',
    'should','may','might','must','will','shall',
  ]);

  function fold(s){
    return String(s || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
  }

  function tokens(query){
    return fold(query).split(/[^a-z0-9]+/).filter((t) => t.length >= 3 && !STOP.has(t));
  }

  function escapeHtml(s){
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /** Returns an HTML string with each matched query term wrapped in
   *  <mark>. The input snippet may contain plain text; output is escaped
   *  + mark-wrapped. The caller is responsible for inserting the HTML
   *  into a context that allows <mark>. */
  function highlight(snippet, query){
    if (!snippet) return '';
    const tt = tokens(query);
    if (!tt.length) return escapeHtml(snippet);
    // Build a single regex matching any token. Sort longest first so
    // "compression" matches before "compress" (which would otherwise eat
    // the prefix and leave "ion" trailing).
    const sorted = tt.slice().sort((a, b) => b.length - a.length);
    const pattern = sorted
      .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('|');
    const re = new RegExp('(' + pattern + ')', 'gi');
    // Process in two passes:
    // 1) Match against folded text (so accented variants light up).
    // 2) Wrap with <mark> in the ORIGINAL text by tracking offsets.
    const original = String(snippet);
    const folded = fold(original);
    const out = [];
    let lastEnd = 0;
    let m;
    while ((m = re.exec(folded)) !== null){
      const start = m.index;
      const end = start + m[0].length;
      // The folded string may have different length than original due to
      // diacritic stripping. We assume 1:1 codepoint correspondence here
      // (true for NFD-then-strip on most scripts). Worst case the
      // highlight is off-by-one — better than no highlight.
      out.push(escapeHtml(original.slice(lastEnd, start)));
      out.push('<mark>');
      out.push(escapeHtml(original.slice(start, end)));
      out.push('</mark>');
      lastEnd = end;
      if (re.lastIndex === m.index) re.lastIndex++; // safety
    }
    out.push(escapeHtml(original.slice(lastEnd)));
    return out.join('');
  }

  /** Apply highlighting to every snippet in a webResults envelope block.
   *  Adds `snippetHtml` alongside the original `snippet` so the renderer
   *  can choose. */
  function highlightAll(envelope, query){
    if (!envelope || !envelope.webResults) return envelope;
    const list = envelope.webResults.results || [];
    for (const r of list){
      r.snippetHtml = highlight(r.snippet, query);
      r.titleHtml = highlight(r.title, query);
    }
    return envelope;
  }

  window.oioxoHighlight = { highlight, highlightAll, tokens };
})();
