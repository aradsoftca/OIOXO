/**
 * Quick-fact card — when a query looks like a factoid lookup
 * ("who is X", "what is X", "where is X", "when did X happen"), fetch a
 * one-paragraph summary from Wikipedia's CORS-clean REST summary API and
 * present it as a quick-answer card. No model, no key, no server.
 *
 *   https://en.wikipedia.org/api/rest_v1/page/summary/{title}
 *
 * Returns title, extract (1-paragraph summary), thumbnail when present,
 * and a citation pointing back to the Wikipedia article. The renderer
 * shows it like a Wikipedia infobox.
 *
 * Exposes window.oioxoFactcard = { tryCard, parsePattern, lookup }.
 */
(function(){
  'use strict';
  if (typeof window === 'undefined') return;
  if (window.oioxoFactcard) return;

  const BUDGET_MS = 700;
  const cache = new Map();
  const CACHE_TTL_MS = 15 * 60 * 1000;
  const MIN_SUBJ_LEN = 2;

  // Match factoid queries. We deliberately don't match too eagerly —
  // "what does encryption mean" goes to definition, not factcard.
  const PATTERNS = [
    /^who\s+(?:is|was|are|were)\s+(.+?)\??$/i,
    /^what\s+(?:is|was|are|were)\s+(?:a|an|the\s+)?(.+?)\??$/i,
    /^where\s+(?:is|was|are)\s+(.+?)\??$/i,
    /^when\s+(?:did|was|were|will)\s+(.+?)(?:\s+(?:happen|occur|start|end|begin|die|born))?\??$/i,
    /^tell\s+me\s+about\s+(.+?)\??$/i,
    /^about\s+(.+?)\??$/i,
  ];

  function parsePattern(q){
    if (!q) return null;
    const s = String(q).trim();
    for (const p of PATTERNS){
      const m = s.match(p);
      if (!m || !m[1]) continue;
      const subject = m[1].trim().replace(/[.!?]+$/, '');
      if (subject.length < MIN_SUBJ_LEN) continue;
      // Avoid obvious definition/translate/time queries.
      if (/^[a-z]{1,12}$/i.test(subject) && /\bmean\b/i.test(s)) return null;
      if (/^time\s+/i.test(subject)) return null;
      if (/\s+(?:in|to)\s+\w+$/i.test(subject)) return null;  // translate-shaped
      return { subject };
    }
    return null;
  }

  async function lookup(subject){
    if (!subject) return null;
    const key = subject.toLowerCase();
    const c = cache.get(key);
    if (c && Date.now() - c.ts < CACHE_TTL_MS) return c.result;
    if (typeof fetch === 'undefined') return null;
    try {
      // Wikipedia REST summary uses title-case; encode + canonicalise.
      const title = encodeURIComponent(subject.replace(/\s+/g, '_'));
      const url = 'https://en.wikipedia.org/api/rest_v1/page/summary/' + title + '?redirect=true';
      const r = await Promise.race([
        fetch(url).then((r) => r.ok ? r.json() : null),
        new Promise((res) => setTimeout(() => res(null), BUDGET_MS)),
      ]);
      if (!r || r.type === 'disambiguation' || !r.extract) return null;
      const result = {
        title: r.title,
        description: r.description || '',
        extract: r.extract,
        thumbnail: r.thumbnail && r.thumbnail.source,
        url: r.content_urls && r.content_urls.desktop && r.content_urls.desktop.page,
      };
      cache.set(key, { result, ts: Date.now() });
      return result;
    } catch { return null; }
  }

  async function tryCard(query){
    const parsed = parsePattern(query);
    if (!parsed) return null;
    const result = await lookup(parsed.subject);
    if (!result) return null;
    return {
      kind: 'fact',
      title: result.title,
      subtitle: result.description,
      icon: '📚',
      confidence: 0.92,
      formatted: result.extract,
      thumbnail: result.thumbnail,
      summary: result.description || ('Quick facts about ' + result.title),
      citation: { source: 'wikipedia', url: result.url || 'https://en.wikipedia.org/wiki/' + encodeURIComponent(result.title.replace(/\s+/g, '_')) },
      inputType: 'none',
    };
  }

  window.oioxoFactcard = { tryCard, parsePattern, lookup };
})();
