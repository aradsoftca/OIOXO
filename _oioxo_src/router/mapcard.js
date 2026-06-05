/**
 * Map / geocode card — uses OpenStreetMap Nominatim (CORS-clean, no key,
 * polite usage) for "map of X", "where is X", "directions to X".
 *
 *   https://nominatim.openstreetmap.org/search?q=X&format=json
 *
 * Returns coordinates + display name. The renderer can show a small
 * OSM tile preview via an iframe to openstreetmap.org/export/embed
 * (also CORS-clean, no key).
 *
 * Polite usage: cache aggressively (24h), pace requests, include a UA.
 *
 * Exposes window.oioxoMapcard = { tryCard, parsePattern, geocode }.
 */
(function(){
  'use strict';
  if (typeof window === 'undefined') return;
  if (window.oioxoMapcard) return;

  const BUDGET_MS = 1000;
  const cache = new Map();
  const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

  const PATTERNS = [
    /^(?:map|maps)\s+(?:of|for)\s+(.+?)\??$/i,
    /^where\s+is\s+(.+?)\??$/i,           // overlap with factcard ok — we run earlier so the user gets a map first
    /^(?:directions|route)\s+to\s+(.+?)\??$/i,
    /^show\s+me\s+(.+?)\s+on\s+(?:the\s+)?map\??$/i,
    /^find\s+(.+?)\s+near\s+me$/i,
    /^(.+?)\s+location$/i,
    /^(.+?)\s+coordinates$/i,
  ];

  function parsePattern(q){
    if (!q) return null;
    const s = String(q).trim();
    for (const p of PATTERNS){
      const m = s.match(p);
      if (m && m[1] && m[1].length >= 2){
        const subject = m[1].trim();
        if (subject.length > 100) continue;
        return { subject };
      }
    }
    return null;
  }

  async function geocode(subject){
    if (typeof fetch === 'undefined') return null;
    const key = subject.toLowerCase();
    const c = cache.get(key);
    if (c && Date.now() - c.ts < CACHE_TTL_MS) return c.result;
    try {
      const url = 'https://nominatim.openstreetmap.org/search?q=' +
        encodeURIComponent(subject) + '&format=json&limit=3&addressdetails=1';
      const r = await Promise.race([
        fetch(url, { headers: { 'Accept-Language': 'en' } }).then((r) => r.ok ? r.json() : null),
        new Promise((res) => setTimeout(() => res(null), BUDGET_MS)),
      ]);
      if (!Array.isArray(r) || !r.length) return null;
      const top = r[0];
      const result = {
        name: top.display_name,
        lat: parseFloat(top.lat),
        lon: parseFloat(top.lon),
        type: top.type,
        category: top.category,
        importance: top.importance,
        address: top.address || {},
        bbox: top.boundingbox ? top.boundingbox.map(Number) : null,
        alternatives: r.slice(1).map((alt) => ({ name: alt.display_name, lat: parseFloat(alt.lat), lon: parseFloat(alt.lon) })),
      };
      cache.set(key, { result, ts: Date.now() });
      return result;
    } catch { return null; }
  }

  function embedUrl(lat, lon, bbox){
    // OSM embed widget — CORS-friendly iframe URL.
    if (bbox && bbox.length === 4){
      // bbox: [south, north, west, east]
      return 'https://www.openstreetmap.org/export/embed.html?bbox=' +
        bbox[2] + ',' + bbox[0] + ',' + bbox[3] + ',' + bbox[1] +
        '&marker=' + lat + ',' + lon;
    }
    const pad = 0.05;
    return 'https://www.openstreetmap.org/export/embed.html?bbox=' +
      (lon - pad) + ',' + (lat - pad) + ',' + (lon + pad) + ',' + (lat + pad) +
      '&marker=' + lat + ',' + lon;
  }

  async function tryCard(query){
    const p = parsePattern(query);
    if (!p) return null;
    const r = await geocode(p.subject);
    if (!r) return null;
    return {
      kind: 'map',
      title: r.name.split(',')[0].trim(),
      subtitle: r.name,
      icon: '📍',
      confidence: 0.87,
      lat: r.lat,
      lon: r.lon,
      formatted: r.lat.toFixed(5) + ', ' + r.lon.toFixed(5),
      embedUrl: embedUrl(r.lat, r.lon, r.bbox),
      placeType: r.type,
      placeCategory: r.category,
      address: r.address,
      alternatives: r.alternatives,
      summary: r.category ? r.category.replace(/_/g, ' ') + (r.type ? ' · ' + r.type.replace(/_/g, ' ') : '') : '',
      citation: { source: 'openstreetmap', url: 'https://www.openstreetmap.org/?mlat=' + r.lat + '&mlon=' + r.lon },
      inputType: 'none',
    };
  }

  window.oioxoMapcard = { tryCard, parsePattern, geocode };
})();
