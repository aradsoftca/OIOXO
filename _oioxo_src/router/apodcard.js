/**
 * Astronomy picture of the day — NASA APOD (free, CORS-clean, no key
 * required for low rate). Triggers on "apod" / "astronomy picture" /
 * "nasa picture today".
 *
 *   https://api.nasa.gov/planetary/apod?api_key=DEMO_KEY
 *
 * DEMO_KEY is NASA's documented public demo key for unauthenticated use.
 *
 * Exposes window.oioxoApodcard = { tryCard, parsePattern, lookup }.
 */
(function(){
  'use strict';
  if (typeof window === 'undefined') return;
  if (window.oioxoApodcard) return;

  const BUDGET_MS = 1000;
  const cache = new Map();
  const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

  const PATTERNS = [
    /^(?:apod|astronomy\s+picture(?:\s+(?:of\s+the\s+day|today))?|nasa\s+(?:picture|image)\s+(?:today|of\s+the\s+day))\??$/i,
    /^space\s+picture$/i,
  ];

  function parsePattern(q){
    if (!q) return null;
    const s = String(q).trim();
    for (const p of PATTERNS) if (p.test(s)) return { today: true };
    return null;
  }

  async function lookup(){
    const key = 'apod:' + new Date().toISOString().slice(0, 10);
    const c = cache.get(key);
    if (c && Date.now() - c.ts < CACHE_TTL_MS) return c.result;
    if (typeof fetch === 'undefined') return null;
    try {
      const url = 'https://api.nasa.gov/planetary/apod?api_key=DEMO_KEY';
      const r = await Promise.race([
        fetch(url).then((r) => r.ok ? r.json() : null),
        new Promise((res) => setTimeout(() => res(null), BUDGET_MS)),
      ]);
      if (!r) return null;
      const result = {
        title: r.title,
        date: r.date,
        explanation: r.explanation,
        url: r.url,
        hdurl: r.hdurl,
        mediaType: r.media_type,
        copyright: r.copyright,
      };
      cache.set(key, { result, ts: Date.now() });
      return result;
    } catch { return null; }
  }

  async function tryCard(query){
    const p = parsePattern(query);
    if (!p) return null;
    const r = await lookup();
    if (!r) return null;
    return {
      kind: 'apod',
      title: r.title,
      subtitle: r.date,
      icon: '🌌',
      confidence: 0.95,
      formatted: r.explanation && r.explanation.slice(0, 400),
      image: r.mediaType === 'image' ? r.url : null,
      hdImage: r.hdurl,
      mediaType: r.mediaType,
      copyright: r.copyright,
      summary: 'NASA · ' + r.date,
      citation: { source: 'nasa apod', url: 'https://apod.nasa.gov/apod/' },
      inputType: 'none',
    };
  }

  window.oioxoApodcard = { tryCard, parsePattern, lookup };
})();
