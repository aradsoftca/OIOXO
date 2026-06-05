/**
 * Image search card — uses Wikimedia Commons (CORS-clean, no key) to
 * surface relevant images for "images of X", "X images", "picture of X".
 *
 *   https://commons.wikimedia.org/w/api.php
 *
 * Returns up to 6 thumbnails with attribution. The card renderer shows
 * them in a small grid. Each result links back to the Commons page.
 *
 * Exposes window.oioxoImagecard = { tryCard, parsePattern }.
 */
(function(){
  'use strict';
  if (typeof window === 'undefined') return;
  if (window.oioxoImagecard) return;

  const BUDGET_MS = 900;
  const cache = new Map();
  const CACHE_TTL_MS = 30 * 60 * 1000;

  const PATTERNS = [
    /^(?:images?|pictures?|pics?|photos?)\s+of\s+(.+?)\??$/i,
    /^(.+?)\s+(?:images?|pictures?|pics?|photos?)$/i,
    /^show\s+me\s+(.+?)$/i,
  ];

  function parsePattern(q){
    if (!q) return null;
    const s = String(q).trim();
    for (const p of PATTERNS){
      const m = s.match(p);
      if (m && m[1] && m[1].length >= 2){
        const subject = m[1].trim();
        if (subject.length > 80) continue;
        return { subject };
      }
    }
    return null;
  }

  async function fetchImages(subject){
    if (typeof fetch === 'undefined') return [];
    const key = subject.toLowerCase();
    const c = cache.get(key);
    if (c && Date.now() - c.ts < CACHE_TTL_MS) return c.results;
    try {
      const url = 'https://commons.wikimedia.org/w/api.php?action=query&format=json' +
        '&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=240' +
        '&generator=search&gsrnamespace=6&gsrlimit=6' +
        '&gsrsearch=' + encodeURIComponent(subject) + '&origin=*';
      const r = await Promise.race([
        fetch(url).then((r) => r.ok ? r.json() : null),
        new Promise((res) => setTimeout(() => res(null), BUDGET_MS)),
      ]);
      if (!r || !r.query || !r.query.pages) return [];
      const out = [];
      for (const page of Object.values(r.query.pages)){
        const info = page.imageinfo && page.imageinfo[0];
        if (!info) continue;
        const meta = info.extmetadata || {};
        out.push({
          title: page.title.replace(/^File:/, '').replace(/\.[a-z]+$/i, ''),
          thumb: info.thumburl || info.url,
          full: info.url,
          page: 'https://commons.wikimedia.org/wiki/' + encodeURIComponent(page.title),
          credit: meta.Artist && String(meta.Artist.value || '').replace(/<[^>]+>/g, '') || '',
          license: meta.LicenseShortName && meta.LicenseShortName.value || 'CC',
        });
      }
      cache.set(key, { results: out, ts: Date.now() });
      return out;
    } catch { return []; }
  }

  async function tryCard(query){
    const p = parsePattern(query);
    if (!p) return null;
    const images = await fetchImages(p.subject);
    if (!images.length) return null;
    return {
      kind: 'images',
      title: 'Images of ' + p.subject,
      icon: '🖼',
      confidence: 0.88,
      images,
      summary: images.length + ' image' + (images.length === 1 ? '' : 's') + ' from Wikimedia Commons',
      citation: { source: 'wikimedia commons', url: 'https://commons.wikimedia.org/wiki/Special:Search?search=' + encodeURIComponent(p.subject) },
      inputType: 'none',
    };
  }

  window.oioxoImagecard = { tryCard, parsePattern };
})();
