/**
 * Academic paper search — uses Crossref (CORS-clean, free, no key, the
 * authoritative DOI registry) for "papers about X", "research on X".
 * Crossref covers the entire scholarly record so we don't need arXiv as
 * a second federated call (we can add it later if recall drops).
 *
 *   https://api.crossref.org/works?query=X&rows=5
 *
 * Returns title, authors, journal, year, DOI link. The renderer shows a
 * compact citation row with the DOI as a clickable link.
 *
 * Exposes window.oioxoAcademiccard = { tryCard, parsePattern }.
 */
(function(){
  'use strict';
  if (typeof window === 'undefined') return;
  if (window.oioxoAcademiccard) return;

  const BUDGET_MS = 1000;
  const cache = new Map();
  const CACHE_TTL_MS = 60 * 60 * 1000;

  const PATTERNS = [
    /^(?:papers?|research|studies|study|articles?|publications?)\s+(?:on|about|regarding|of)\s+(.+?)\??$/i,
    /^academic\s+(.+?)$/i,
    /^scholar\s+(.+?)$/i,
    /^arxiv\s+(.+?)$/i,
    /^(?:literature\s+(?:on|about))\s+(.+?)$/i,
    /^cite\s+(.+?)$/i,
  ];

  function parsePattern(q){
    if (!q) return null;
    const s = String(q).trim();
    for (const p of PATTERNS){
      const m = s.match(p);
      if (m && m[1] && m[1].length >= 2){
        const subject = m[1].trim();
        if (subject.length > 100) continue;
        return { subject };
      }
    }
    return null;
  }

  async function search(subject){
    if (typeof fetch === 'undefined') return [];
    const key = subject.toLowerCase();
    const c = cache.get(key);
    if (c && Date.now() - c.ts < CACHE_TTL_MS) return c.results;
    try {
      const url = 'https://api.crossref.org/works?query=' + encodeURIComponent(subject) +
        '&rows=5&select=DOI,title,author,container-title,published,abstract';
      const r = await Promise.race([
        fetch(url).then((r) => r.ok ? r.json() : null),
        new Promise((res) => setTimeout(() => res(null), BUDGET_MS)),
      ]);
      if (!r || !r.message || !r.message.items) return [];
      const out = r.message.items.slice(0, 5).map((it) => ({
        title: (it.title && it.title[0]) || 'Untitled',
        authors: (it.author || []).slice(0, 4).map((a) => (a.given ? a.given + ' ' : '') + (a.family || '')),
        journal: (it['container-title'] && it['container-title'][0]) || '',
        year: it.published && it.published['date-parts'] && it.published['date-parts'][0] && it.published['date-parts'][0][0],
        doi: it.DOI,
        url: it.DOI ? 'https://doi.org/' + it.DOI : null,
        abstract: it.abstract ? String(it.abstract).replace(/<[^>]+>/g, '').slice(0, 300) : '',
      }));
      cache.set(key, { results: out, ts: Date.now() });
      return out;
    } catch { return []; }
  }

  async function tryCard(query){
    const p = parsePattern(query);
    if (!p) return null;
    const papers = await search(p.subject);
    if (!papers.length) return null;
    return {
      kind: 'academic',
      title: 'Papers: ' + p.subject,
      icon: '📚',
      confidence: 0.86,
      papers,
      summary: papers.length + ' paper' + (papers.length === 1 ? '' : 's') + ' from Crossref',
      citation: { source: 'crossref', url: 'https://search.crossref.org/?q=' + encodeURIComponent(p.subject) },
      inputType: 'none',
    };
  }

  window.oioxoAcademiccard = { tryCard, parsePattern, search };
})();
