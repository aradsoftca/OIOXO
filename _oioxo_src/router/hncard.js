/**
 * HackerNews card — Algolia HN Search API (CORS-clean, free, no key) for
 * "hn X" / "hackernews X".
 *
 *   https://hn.algolia.com/api/v1/search?query=X
 *
 * Exposes window.oioxoHncard = { tryCard, parsePattern, search }.
 */
(function(){
  'use strict';
  if (typeof window === 'undefined') return;
  if (window.oioxoHncard) return;

  const BUDGET_MS = 800;
  const cache = new Map();
  const CACHE_TTL_MS = 10 * 60 * 1000;

  const PATTERNS = [
    /^(?:hn|hackernews|hacker news|y combinator|ycombinator)\s+(.+?)\??$/i,
    /^(.+?)\s+(?:hn|hackernews)$/i,
  ];

  function parsePattern(q){
    if (!q) return null;
    const s = String(q).trim();
    for (const p of PATTERNS){
      const m = s.match(p);
      if (m && m[1] && m[1].length >= 2){
        return { subject: m[1].trim() };
      }
    }
    return null;
  }

  async function search(subject){
    if (typeof fetch === 'undefined' || !subject) return [];
    const key = subject.toLowerCase();
    const c = cache.get(key);
    if (c && Date.now() - c.ts < CACHE_TTL_MS) return c.results;
    try {
      const url = 'https://hn.algolia.com/api/v1/search?query=' + encodeURIComponent(subject) + '&hitsPerPage=5&tags=story';
      const r = await Promise.race([
        fetch(url).then((r) => r.ok ? r.json() : null),
        new Promise((res) => setTimeout(() => res(null), BUDGET_MS)),
      ]);
      if (!r || !r.hits) return [];
      const out = r.hits.slice(0, 5).map((h) => ({
        title: h.title || h.story_title,
        url: h.url || ('https://news.ycombinator.com/item?id=' + h.objectID),
        author: h.author,
        points: h.points,
        comments: h.num_comments,
        ts: h.created_at_i ? h.created_at_i * 1000 : null,
        id: h.objectID,
      }));
      cache.set(key, { results: out, ts: Date.now() });
      return out;
    } catch { return []; }
  }

  async function tryCard(query){
    const p = parsePattern(query);
    if (!p) return null;
    const items = await search(p.subject);
    if (!items.length) return null;
    return {
      kind: 'hn',
      title: 'HackerNews: ' + p.subject,
      icon: '🐝',
      confidence: 0.82,
      stories: items,
      summary: items.length + ' stor' + (items.length === 1 ? 'y' : 'ies'),
      citation: { source: 'hackernews', url: 'https://hn.algolia.com/?query=' + encodeURIComponent(p.subject) },
      inputType: 'none',
    };
  }

  window.oioxoHncard = { tryCard, parsePattern, search };
})();
