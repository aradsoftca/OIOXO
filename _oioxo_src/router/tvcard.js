/**
 * TV / movie card — TVmaze (CORS-clean, free, no key) for "tv X" /
 * "watch X" / "X tv show" / "X episodes".
 *
 *   https://api.tvmaze.com/search/shows?q=X
 *
 * Exposes window.oioxoTvcard = { tryCard, parsePattern, search }.
 */
(function(){
  'use strict';
  if (typeof window === 'undefined') return;
  if (window.oioxoTvcard) return;

  const BUDGET_MS = 900;
  const cache = new Map();
  const CACHE_TTL_MS = 60 * 60 * 1000;

  const PATTERNS = [
    /^(?:tv|tv show|series|show|watch)\s+(.+?)\??$/i,
    /^(.+?)\s+(?:tv show|series|tv series|episodes?)$/i,
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
    if (typeof fetch === 'undefined' || !subject) return null;
    const key = subject.toLowerCase();
    const c = cache.get(key);
    if (c && Date.now() - c.ts < CACHE_TTL_MS) return c.result;
    try {
      const url = 'https://api.tvmaze.com/search/shows?q=' + encodeURIComponent(subject);
      const r = await Promise.race([
        fetch(url).then((r) => r.ok ? r.json() : null),
        new Promise((res) => setTimeout(() => res(null), BUDGET_MS)),
      ]);
      if (!Array.isArray(r) || !r.length) return null;
      const top = r[0].show;
      const result = {
        name: top.name,
        genres: top.genres,
        status: top.status,
        rating: top.rating && top.rating.average,
        premiered: top.premiered,
        ended: top.ended,
        summary: (top.summary || '').replace(/<[^>]+>/g, '').slice(0, 320),
        image: top.image && (top.image.medium || top.image.original),
        url: top.url,
        network: top.network && top.network.name,
        runtime: top.runtime,
      };
      cache.set(key, { result, ts: Date.now() });
      return result;
    } catch { return null; }
  }

  async function tryCard(query){
    const p = parsePattern(query);
    if (!p) return null;
    const r = await search(p.subject);
    if (!r) return null;
    return {
      kind: 'tv',
      title: r.name,
      subtitle: (r.genres || []).join(' · ') + (r.network ? ' · ' + r.network : ''),
      icon: '📺',
      confidence: 0.86,
      formatted: r.summary,
      image: r.image,
      rating: r.rating,
      premiered: r.premiered,
      status: r.status,
      runtime: r.runtime,
      summary: r.status + (r.rating ? ' · ★ ' + r.rating : ''),
      citation: { source: 'tvmaze', url: r.url || 'https://www.tvmaze.com/' },
      inputType: 'none',
    };
  }

  window.oioxoTvcard = { tryCard, parsePattern, search };
})();
