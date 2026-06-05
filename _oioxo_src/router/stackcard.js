/**
 * Stack Overflow card — uses the public Stack Exchange API (CORS-clean,
 * no key for read-only basic search) for "stack X" / "stackoverflow X"
 * queries.
 *
 *   https://api.stackexchange.com/2.3/search/advanced?q=X&site=stackoverflow
 *
 * Returns top 5 questions with answer counts + scores.
 *
 * Exposes window.oioxoStackcard = { tryCard, parsePattern, search }.
 */
(function(){
  'use strict';
  if (typeof window === 'undefined') return;
  if (window.oioxoStackcard) return;

  const BUDGET_MS = 900;
  const cache = new Map();
  const CACHE_TTL_MS = 15 * 60 * 1000;

  const PATTERNS = [
    /^(?:stack|stackoverflow|so)\s+(.+?)\??$/i,
    /^(.+?)\s+stackoverflow\??$/i,
    /^how\s+to\s+(.+?)\s+(?:in|with)\s+(?:js|python|go|rust|java|c\+\+|typescript)\b/i,
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
      const url = 'https://api.stackexchange.com/2.3/search/advanced?order=desc&sort=relevance' +
        '&q=' + encodeURIComponent(subject) + '&site=stackoverflow&pagesize=5';
      const r = await Promise.race([
        fetch(url).then((r) => r.ok ? r.json() : null),
        new Promise((res) => setTimeout(() => res(null), BUDGET_MS)),
      ]);
      if (!r || !r.items) return [];
      const out = r.items.slice(0, 5).map((it) => ({
        title: decodeHtml(it.title),
        score: it.score,
        answers: it.answer_count,
        accepted: it.is_answered,
        tags: (it.tags || []).slice(0, 4),
        url: it.link,
      }));
      cache.set(key, { results: out, ts: Date.now() });
      return out;
    } catch { return []; }
  }

  function decodeHtml(s){
    return String(s || '')
      .replace(/&quot;/g, '"').replace(/&#039;/g, "'")
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  }

  async function tryCard(query){
    const p = parsePattern(query);
    if (!p) return null;
    const items = await search(p.subject);
    if (!items.length) return null;
    return {
      kind: 'stack',
      title: 'Stack Overflow: ' + p.subject,
      icon: '💬',
      confidence: 0.85,
      questions: items,
      summary: items.length + ' question' + (items.length === 1 ? '' : 's'),
      citation: { source: 'stackoverflow', url: 'https://stackoverflow.com/search?q=' + encodeURIComponent(p.subject) },
      inputType: 'none',
    };
  }

  window.oioxoStackcard = { tryCard, parsePattern, search };
})();
