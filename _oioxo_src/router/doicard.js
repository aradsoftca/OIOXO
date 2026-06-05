/**
 * DOI card — Crossref by DOI (CORS-clean, free, no key) for bare DOI
 * lookups like "10.1038/nature12373" or "doi:10.1038/...".
 *
 *   https://api.crossref.org/works/{doi}
 *
 * Exposes window.oioxoDoicard = { tryCard, parsePattern, lookup }.
 */
(function(){
  'use strict';
  if (typeof window === 'undefined') return;
  if (window.oioxoDoicard) return;

  const BUDGET_MS = 900;
  const cache = new Map();
  const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

  const DOI_RE = /^(?:doi:?|https?:\/\/(?:dx\.)?doi\.org\/)?(10\.\d{4,9}\/[^\s]+)$/i;

  function parsePattern(q){
    if (!q) return null;
    const s = String(q).trim();
    const m = s.match(DOI_RE);
    if (m) return { doi: m[1] };
    return null;
  }

  async function lookup(doi){
    if (typeof fetch === 'undefined' || !doi) return null;
    const key = 'doi:' + doi.toLowerCase();
    const c = cache.get(key);
    if (c && Date.now() - c.ts < CACHE_TTL_MS) return c.result;
    try {
      const url = 'https://api.crossref.org/works/' + encodeURIComponent(doi);
      const r = await Promise.race([
        fetch(url).then((r) => r.ok ? r.json() : null),
        new Promise((res) => setTimeout(() => res(null), BUDGET_MS)),
      ]);
      if (!r || !r.message) return null;
      const m = r.message;
      const result = {
        title: (m.title && m.title[0]) || 'Untitled',
        authors: (m.author || []).map((a) => ((a.given ? a.given + ' ' : '') + (a.family || '')).trim()),
        journal: (m['container-title'] && m['container-title'][0]) || '',
        year: m.published && m.published['date-parts'] && m.published['date-parts'][0] && m.published['date-parts'][0][0],
        type: m.type,
        publisher: m.publisher,
        abstract: m.abstract ? String(m.abstract).replace(/<[^>]+>/g, '').slice(0, 400) : '',
        url: 'https://doi.org/' + doi,
        doi,
      };
      cache.set(key, { result, ts: Date.now() });
      return result;
    } catch { return null; }
  }

  async function tryCard(query){
    const p = parsePattern(query);
    if (!p) return null;
    const r = await lookup(p.doi);
    if (!r) return null;
    return {
      kind: 'doi',
      title: r.title,
      subtitle: r.authors.slice(0, 3).join(', ') + (r.year ? ' (' + r.year + ')' : ''),
      icon: '📄',
      confidence: 0.92,
      formatted: r.abstract,
      journal: r.journal,
      publisher: r.publisher,
      type: r.type,
      doi: r.doi,
      summary: r.journal || r.publisher || r.type,
      citation: { source: 'crossref', url: r.url },
      inputType: 'none',
    };
  }

  window.oioxoDoicard = { tryCard, parsePattern, lookup };
})();
