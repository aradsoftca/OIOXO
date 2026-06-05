/**
 * Flight status card — uses OpenSky Network (CORS-clean, free, no key
 * for read-only state queries) for "flight XX1234".
 *
 *   https://opensky-network.org/api/states/all?icao24=X
 *
 * Anonymous OpenSky access is rate-limited but enough for casual SERP
 * use. Returns live state vector (lat, lon, alt, speed, heading).
 *
 * Exposes window.oioxoFlightcard = { tryCard, parsePattern }.
 */
(function(){
  'use strict';
  if (typeof window === 'undefined') return;
  if (window.oioxoFlightcard) return;

  const BUDGET_MS = 1200;
  const cache = new Map();
  const CACHE_TTL_MS = 30 * 1000;

  const PATTERNS = [
    /^flight\s+([A-Z]{2,3}\s?\d{1,5})\??$/i,
    /^([A-Z]{2,3}\s?\d{1,5})\s+(?:flight|status)$/i,
    /^(?:track|where\s+is)\s+([A-Z]{2,3}\s?\d{1,5})\??$/i,
  ];

  function parsePattern(q){
    if (!q) return null;
    const s = String(q).trim();
    for (const p of PATTERNS){
      const m = s.match(p);
      if (m && m[1]){
        const callsign = m[1].replace(/\s+/g, '').toUpperCase();
        return { callsign };
      }
    }
    return null;
  }

  async function lookup(callsign){
    if (typeof fetch === 'undefined') return null;
    const key = callsign;
    const c = cache.get(key);
    if (c && Date.now() - c.ts < CACHE_TTL_MS) return c.result;
    try {
      // OpenSky doesn't have a direct callsign filter; we filter the
      // global state vector. Lighter would be /api/states/all?icao24=X
      // but we only have the callsign. Strict budget so this doesn't
      // hang on big payloads.
      const url = 'https://opensky-network.org/api/states/all';
      const r = await Promise.race([
        fetch(url).then((r) => r.ok ? r.json() : null),
        new Promise((res) => setTimeout(() => res(null), BUDGET_MS)),
      ]);
      if (!r || !Array.isArray(r.states)) return null;
      const target = r.states.find((s) => s[1] && s[1].trim().toUpperCase() === callsign);
      if (!target) return null;
      const result = {
        icao24: target[0],
        callsign: (target[1] || '').trim(),
        origin: target[2],
        lon: target[5],
        lat: target[6],
        baroAltitude: target[7],
        onGround: target[8],
        velocity: target[9],
        heading: target[10],
        verticalRate: target[11],
        category: target[17],
        ts: Date.now(),
      };
      cache.set(key, { result, ts: Date.now() });
      return result;
    } catch { return null; }
  }

  async function tryCard(query){
    const p = parsePattern(query);
    if (!p) return null;
    const f = await lookup(p.callsign);
    if (!f) return null;
    const altFt = f.baroAltitude != null ? Math.round(f.baroAltitude * 3.28084) : null;
    const speedKts = f.velocity != null ? Math.round(f.velocity * 1.94384) : null;
    return {
      kind: 'flight',
      title: 'Flight ' + p.callsign,
      subtitle: f.origin || '',
      icon: '✈',
      confidence: 0.85,
      lat: f.lat,
      lon: f.lon,
      formatted: f.onGround ? 'On ground' : (altFt ? altFt.toLocaleString() + ' ft · ' + speedKts + ' kts' : 'Airborne'),
      altitudeFt: altFt,
      speedKts,
      heading: f.heading,
      onGround: f.onGround,
      verticalRate: f.verticalRate,
      summary: f.lat != null ? f.lat.toFixed(3) + '°, ' + f.lon.toFixed(3) + '°' : 'Live state',
      citation: { source: 'opensky network', url: 'https://opensky-network.org/aircraft-profile?icao24=' + f.icao24 },
      inputType: 'none',
    };
  }

  window.oioxoFlightcard = { tryCard, parsePattern, lookup };
})();
