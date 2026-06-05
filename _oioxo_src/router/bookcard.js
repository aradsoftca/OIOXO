/**
 * Book search card — uses Open Library (CORS-clean, free, no key) to
 * surface book matches for "book X", "X by author", "books about X".
 *
 *   https://openlibrary.org/search.json?q=X
 *
 * Returns title, author(s), first publish year, cover image, and a link
 * to the Open Library page. Cover images are also free and CDN-fast.
 *
 * Exposes window.oioxoBookcard = { tryCard, parsePattern }.
 */
(function(){
  'use strict';
  if (typeof window === 'undefined') return;
  if (window.oioxoBookcard) return;

  const BUDGET_MS = 900;
  const cache = new Map();
  const CACHE_TTL_MS = 60 * 60 * 1000;

  const PATTERNS = [
    /^(?:book|books)\s+(?:on|about|of)\s+(.+?)\??$/i,
    /^(.+?)\s+by\s+(.+?)$/i,
    /^find\s+book\s+(.+?)$/i,
    /^read\s+(.+?)$/i,
    /^(?:novel|novels)\s+(?:by|about)\s+(.+?)$/i,
  ];

  function parsePattern(q){
    if (!q) return null;
    const s = String(q).trim();
    for (const p of PATTERNS){
      const m = s.match(p);
      if (m && m[1] && m[1].length >= 2){
        const subject = m[1].trim();
        if (subject.length > 100) continue;
        return { subject, author: m[2] && m[2].trim() };
      }
    }
    return null;
  }

  async function search(subject, author){
    if (typeof fetch === 'undefined') return [];
    const key = (subject + '|' + (author || '')).toLowerCase();
    const c = cache.get(key);
    if (c && Date.now() - c.ts < CACHE_TTL_MS) return c.results;
    try {
      let q = subject;
      if (author) q += ' author:' + author;
      const url = 'https://openlibrary.org/search.json?q=' + encodeURIComponent(q) +
        '&limit=5&fields=key,title,author_name,first_publish_year,cover_i,subject';
      const r = await Promise.race([
        fetch(url).then((r) => r.ok ? r.json() : null),
        new Promise((res) => setTimeout(() => res(null), BUDGET_MS)),
      ]);
      if (!r || !r.docs) return [];
      const out = r.docs.slice(0, 5).map((d) => ({
        title: d.title,
        authors: d.author_name || [],
        year: d.first_publish_year,
        cover: d.cover_i ? 'https://covers.openlibrary.org/b/id/' + d.cover_i + '-M.jpg' : null,
        page: 'https://openlibrary.org' + d.key,
        subjects: (d.subject || []).slice(0, 5),
      }));
      cache.set(key, { results: out, ts: Date.now() });
      return out;
    } catch { return []; }
  }

  async function tryCard(query){
    const p = parsePattern(query);
    if (!p) return null;
    const books = await search(p.subject, p.author);
    if (!books.length) return null;
    return {
      kind: 'books',
      title: p.author ? p.subject + ' by ' + p.author : 'Books: ' + p.subject,
      icon: '📖',
      confidence: 0.85,
      books,
      summary: books.length + ' result' + (books.length === 1 ? '' : 's') + ' from Open Library',
      citation: { source: 'open library', url: 'https://openlibrary.org/search?q=' + encodeURIComponent(p.subject) },
      inputType: 'none',
    };
  }

  window.oioxoBookcard = { tryCard, parsePattern, search };
})();
