/**
 * Wayback Machine card — Internet Archive's availability API (CORS-clean,
 * free, no key) for "old version of X" / "X archived" / "X 2010".
 *
 *   https://archive.org/wayback/available?url=X&timestamp=Y
 *
 * Exposes window.oioxoWaybackcard = { tryCard, parsePattern, lookup }.
 */
(function(){
  'use strict';
  if (typeof window === 'undefined') return;
  if (window.oioxoWaybackcard) return;

  const BUDGET_MS = 1000;
  const cache = new Map();
  const CACHE_TTL_MS = 60 * 60 * 1000;

  const PATTERNS = [
    /^(?:wayback|archived?)\s+(?:version\s+(?:of\s+)?)?(.+?)\??$/i,
    /^old\s+version\s+(?:of\s+)?(.+?)\??$/i,
    /^(.+?)\s+(?:archived|wayback)$/i,
    /^(.+?)\s+in\s+((?:19|20)\d{2})$/i,
  ];

  function parsePattern(q){
    if (!q) return null;
    const s = String(q).trim();
    for (const p of PATTERNS){
      const m = s.match(p);
      if (m && m[1] && m[1].length >= 3){
        return { url: m[1].trim(), year: m[2] || null };
      }
    }
    return null;
  }

  async function lookup(target, year){
    if (typeof fetch === 'undefined' || !target) return null;
    const key = target.toLowerCase() + '|' + (year || '');
    const c = cache.get(key);
    if (c && Date.now() - c.ts < CACHE_TTL_MS) return c.result;
    try {
      // Normalise: drop leading "the " and add https:// if it's a plain host.
      let target_ = target.replace(/^the\s+/i, '');
      if (!/^https?:\/\//i.test(target_) && /\./.test(target_)) target_ = 'https://' + target_;
      const ts = year ? year + '0101' : '';
      const url = 'https://archive.org/wayback/available?url=' + encodeURIComponent(target_) +
        (ts ? '&timestamp=' + ts : '');
      const r = await Promise.race([
        fetch(url).then((r) => r.ok ? r.json() : null),
        new Promise((res) => setTimeout(() => res(null), BUDGET_MS)),
      ]);
      if (!r || !r.archived_snapshots || !r.archived_snapshots.closest) return null;
      const snap = r.archived_snapshots.closest;
      const result = {
        url: snap.url,
        timestamp: snap.timestamp,
        prettyDate: snap.timestamp ? (snap.timestamp.slice(0,4)+'-'+snap.timestamp.slice(4,6)+'-'+snap.timestamp.slice(6,8)) : null,
        available: snap.available,
        status: snap.status,
        target: target_,
      };
      cache.set(key, { result, ts: Date.now() });
      return result;
    } catch { return null; }
  }

  async function tryCard(query){
    const p = parsePattern(query);
    if (!p) return null;
    const r = await lookup(p.url, p.year);
    if (!r) return null;
    return {
      kind: 'wayback',
      title: 'Archived: ' + r.target.replace(/^https?:\/\//, ''),
      subtitle: r.prettyDate || '',
      icon: '🕰',
      confidence: 0.86,
      formatted: 'Snapshot from ' + (r.prettyDate || 'archive') + ' available',
      archiveUrl: r.url,
      timestamp: r.timestamp,
      summary: 'Wayback Machine snapshot',
      citation: { source: 'internet archive', url: r.url },
      inputType: 'none',
    };
  }

  window.oioxoWaybackcard = { tryCard, parsePattern, lookup };
})();
