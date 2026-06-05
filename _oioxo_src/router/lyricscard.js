/**
 * Lyrics card — uses LRClib (CORS-clean, free, no key) for
 * "lyrics X", "X lyrics", "lyrics to X by Y".
 *
 *   https://lrclib.net/api/search?q=X
 *
 * LRClib also returns synced timestamps (LRC format) when available so
 * the renderer can scroll lyrics in sync with playback.
 *
 * Exposes window.oioxoLyricscard = { tryCard, parsePattern }.
 */
(function(){
  'use strict';
  if (typeof window === 'undefined') return;
  if (window.oioxoLyricscard) return;

  const BUDGET_MS = 900;
  const cache = new Map();
  const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

  const PATTERNS = [
    /^lyrics\s+(?:to|of|for)\s+(.+?)\??$/i,
    /^(.+?)\s+lyrics$/i,
    /^lyrics\s+(.+?)$/i,
  ];

  function parsePattern(q){
    if (!q) return null;
    const s = String(q).trim();
    for (const p of PATTERNS){
      const m = s.match(p);
      if (m && m[1] && m[1].length >= 2){
        const subject = m[1].trim();
        if (subject.length > 100) continue;
        // Split "song by artist" if present.
        const byMatch = subject.match(/^(.+?)\s+by\s+(.+)$/i);
        if (byMatch) return { track: byMatch[1].trim(), artist: byMatch[2].trim() };
        return { track: subject };
      }
    }
    return null;
  }

  async function search(track, artist){
    if (typeof fetch === 'undefined') return null;
    const key = (track + '|' + (artist || '')).toLowerCase();
    const c = cache.get(key);
    if (c && Date.now() - c.ts < CACHE_TTL_MS) return c.result;
    try {
      let url = 'https://lrclib.net/api/search?track_name=' + encodeURIComponent(track);
      if (artist) url += '&artist_name=' + encodeURIComponent(artist);
      const r = await Promise.race([
        fetch(url).then((r) => r.ok ? r.json() : null),
        new Promise((res) => setTimeout(() => res(null), BUDGET_MS)),
      ]);
      if (!Array.isArray(r) || !r.length) return null;
      const top = r[0];
      const result = {
        track: top.trackName,
        artist: top.artistName,
        album: top.albumName,
        duration: top.duration,
        plainLyrics: top.plainLyrics,
        syncedLyrics: top.syncedLyrics,
        instrumental: top.instrumental,
        id: top.id,
      };
      cache.set(key, { result, ts: Date.now() });
      return result;
    } catch { return null; }
  }

  async function tryCard(query){
    const p = parsePattern(query);
    if (!p) return null;
    const r = await search(p.track, p.artist);
    if (!r || !r.plainLyrics) return null;
    return {
      kind: 'lyrics',
      title: r.track,
      subtitle: r.artist + (r.album ? ' · ' + r.album : ''),
      icon: '🎵',
      confidence: 0.88,
      formatted: r.plainLyrics.split('\n').slice(0, 24).join('\n'),
      fullLyrics: r.plainLyrics,
      syncedLyrics: r.syncedLyrics,
      duration: r.duration,
      summary: 'Lyrics — ' + r.artist,
      citation: { source: 'lrclib', url: 'https://lrclib.net/?q=' + encodeURIComponent(p.track) },
      inputType: 'none',
    };
  }

  window.oioxoLyricscard = { tryCard, parsePattern, search };
})();
