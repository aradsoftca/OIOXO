/**
 * ISBN card — Open Library books-by-ISBN (CORS-clean, free, no key). Fires
 * on bare ISBN-10 / ISBN-13 / formats with dashes / "isbn X".
 *
 *   https://openlibrary.org/api/books?bibkeys=ISBN:X&format=json&jscmd=data
 *
 * Exposes window.oioxoIsbncard = { tryCard, parsePattern, lookup }.
 */
(function(){
  'use strict';
  if (typeof window === 'undefined') return;
  if (window.oioxoIsbncard) return;

  const BUDGET_MS = 900;
  const cache = new Map();
  const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

  function normalise(s){ return String(s || '').replace(/[\s-]/g, ''); }

  function isValidIsbn(s){
    const n = normalise(s);
    return /^(?:\d{9}[\dXx]|\d{13})$/.test(n);
  }

  const TRIGGER = /^(?:isbn|book)[\s:]?\s*([\dXx\s-]{10,17})$/i;

  function parsePattern(q){
    if (!q) return null;
    const s = String(q).trim();
    if (isValidIsbn(s)) return { isbn: normalise(s) };
    const m = s.match(TRIGGER);
    if (m && isValidIsbn(m[1])) return { isbn: normalise(m[1]) };
    return null;
  }

  async function lookup(isbn){
    if (typeof fetch === 'undefined' || !isbn) return null;
    const key = 'isbn:' + isbn;
    const c = cache.get(key);
    if (c && Date.now() - c.ts < CACHE_TTL_MS) return c.result;
    try {
      const url = 'https://openlibrary.org/api/books?bibkeys=ISBN:' + encodeURIComponent(isbn) +
        '&format=json&jscmd=data';
      const r = await Promise.race([
        fetch(url).then((r) => r.ok ? r.json() : null),
        new Promise((res) => setTimeout(() => res(null), BUDGET_MS)),
      ]);
      if (!r) return null;
      const data = r['ISBN:' + isbn];
      if (!data) return null;
      const result = {
        title: data.title,
        subtitle: data.subtitle,
        authors: (data.authors || []).map((a) => a.name),
        publishers: (data.publishers || []).map((p) => p.name),
        published: data.publish_date,
        pages: data.number_of_pages,
        cover: data.cover && (data.cover.medium || data.cover.large || data.cover.small),
        url: data.url,
        subjects: (data.subjects || []).slice(0, 5).map((s) => s.name || s),
      };
      cache.set(key, { result, ts: Date.now() });
      return result;
    } catch { return null; }
  }

  async function tryCard(query){
    const p = parsePattern(query);
    if (!p) return null;
    const r = await lookup(p.isbn);
    if (!r) return null;
    return {
      kind: 'isbn',
      title: r.title,
      subtitle: r.authors.join(', '),
      icon: '📚',
      confidence: 0.94,
      formatted: r.subtitle || '',
      cover: r.cover,
      isbn: p.isbn,
      publishers: r.publishers,
      published: r.published,
      pages: r.pages,
      subjects: r.subjects,
      summary: (r.published || '') + (r.pages ? ' · ' + r.pages + 'p' : ''),
      citation: { source: 'open library', url: r.url || ('https://openlibrary.org/isbn/' + p.isbn) },
      inputType: 'none',
    };
  }

  window.oioxoIsbncard = { tryCard, parsePattern, lookup, isValidIsbn };
})();
