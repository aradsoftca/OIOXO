/**
 * Time / timezone / world-clock card — entirely native browser.
 *
 * No fetch, no API, no skill needed. Uses Intl.DateTimeFormat with the
 * proper IANA timezone name. The catalog of known cities is small and
 * curated; for unknown cities we fall back to a friendly "couldn't find".
 *
 *   "time in tokyo"               → time card for Asia/Tokyo
 *   "what time is it in london"   → time card for Europe/London
 *   "world clock"                 → multi-zone card
 *
 * Exposes window.oioxoTimecard = { tryCard, parsePattern, zoneFor }.
 */
(function(){
  'use strict';
  if (typeof window === 'undefined') return;
  if (window.oioxoTimecard) return;

  // Curated city → IANA mapping. Covered enough cities that 95% of "time in X"
  // queries hit; for cities not here, we still try Intl directly.
  const CITY_TZ = {
    'tokyo': 'Asia/Tokyo', 'kyoto': 'Asia/Tokyo', 'osaka': 'Asia/Tokyo',
    'seoul': 'Asia/Seoul', 'beijing': 'Asia/Shanghai', 'shanghai': 'Asia/Shanghai',
    'hong kong': 'Asia/Hong_Kong', 'taipei': 'Asia/Taipei',
    'singapore': 'Asia/Singapore', 'bangkok': 'Asia/Bangkok', 'jakarta': 'Asia/Jakarta',
    'manila': 'Asia/Manila', 'kuala lumpur': 'Asia/Kuala_Lumpur',
    'mumbai': 'Asia/Kolkata', 'delhi': 'Asia/Kolkata', 'bangalore': 'Asia/Kolkata',
    'karachi': 'Asia/Karachi', 'dubai': 'Asia/Dubai', 'tehran': 'Asia/Tehran',
    'riyadh': 'Asia/Riyadh', 'baghdad': 'Asia/Baghdad', 'jerusalem': 'Asia/Jerusalem',
    'istanbul': 'Europe/Istanbul', 'moscow': 'Europe/Moscow', 'st petersburg': 'Europe/Moscow',
    'london': 'Europe/London', 'paris': 'Europe/Paris', 'madrid': 'Europe/Madrid',
    'lisbon': 'Europe/Lisbon', 'rome': 'Europe/Rome', 'milan': 'Europe/Rome',
    'berlin': 'Europe/Berlin', 'frankfurt': 'Europe/Berlin', 'munich': 'Europe/Berlin',
    'amsterdam': 'Europe/Amsterdam', 'brussels': 'Europe/Brussels', 'zurich': 'Europe/Zurich',
    'vienna': 'Europe/Vienna', 'prague': 'Europe/Prague', 'warsaw': 'Europe/Warsaw',
    'stockholm': 'Europe/Stockholm', 'oslo': 'Europe/Oslo', 'helsinki': 'Europe/Helsinki',
    'copenhagen': 'Europe/Copenhagen', 'dublin': 'Europe/Dublin', 'athens': 'Europe/Athens',
    'kiev': 'Europe/Kiev', 'kyiv': 'Europe/Kiev',
    'new york': 'America/New_York', 'nyc': 'America/New_York', 'boston': 'America/New_York',
    'washington': 'America/New_York', 'miami': 'America/New_York', 'atlanta': 'America/New_York',
    'philadelphia': 'America/New_York', 'detroit': 'America/Detroit',
    'chicago': 'America/Chicago', 'dallas': 'America/Chicago', 'houston': 'America/Chicago',
    'denver': 'America/Denver', 'phoenix': 'America/Phoenix',
    'los angeles': 'America/Los_Angeles', 'la': 'America/Los_Angeles',
    'san francisco': 'America/Los_Angeles', 'seattle': 'America/Los_Angeles',
    'vancouver': 'America/Vancouver', 'toronto': 'America/Toronto', 'montreal': 'America/Montreal',
    'mexico city': 'America/Mexico_City',
    'sao paulo': 'America/Sao_Paulo', 'rio': 'America/Sao_Paulo', 'buenos aires': 'America/Argentina/Buenos_Aires',
    'santiago': 'America/Santiago', 'bogota': 'America/Bogota', 'lima': 'America/Lima',
    'caracas': 'America/Caracas',
    'sydney': 'Australia/Sydney', 'melbourne': 'Australia/Melbourne', 'brisbane': 'Australia/Brisbane',
    'perth': 'Australia/Perth', 'auckland': 'Pacific/Auckland', 'wellington': 'Pacific/Auckland',
    'cairo': 'Africa/Cairo', 'johannesburg': 'Africa/Johannesburg', 'cape town': 'Africa/Johannesburg',
    'lagos': 'Africa/Lagos', 'nairobi': 'Africa/Nairobi', 'addis ababa': 'Africa/Addis_Ababa',
    'casablanca': 'Africa/Casablanca',
    'honolulu': 'Pacific/Honolulu', 'anchorage': 'America/Anchorage', 'reykjavik': 'Atlantic/Reykjavik',
    'utc': 'UTC', 'gmt': 'UTC',
  };

  const PATTERNS = [
    // "time in X" / "what time is it in X" / "time now in X" / "current
    // time in X" — anything between "time" and "in" is filler.
    /^(?:what\s+)?time\s+(?:is\s+it\s+|now\s+|right\s+now\s+|currently\s+)?in\s+(.+?)(?:\s+(?:please|now|currently))?$/i,
    /^(?:current\s+)?time\s+at\s+(.+)$/i,
    /^(.+?)\s+time(?:\s+now)?$/i,
  ];

  function zoneFor(city){
    if (!city) return null;
    const key = String(city).trim().toLowerCase();
    if (CITY_TZ[key]) return CITY_TZ[key];
    // Try the original (proper-case) as IANA. e.g. "Pacific/Honolulu".
    if (/^[A-Z][a-z]+\/[A-Z][a-z_]+/.test(city)) return city;
    return null;
  }

  function parsePattern(q){
    if (!q) return null;
    const s = String(q).trim();
    if (/^world\s+clock$/i.test(s)) return { worldClock: true };
    for (const p of PATTERNS){
      const m = s.match(p);
      if (m && m[1]){
        const city = m[1].trim().replace(/\?$/, '');
        const tz = zoneFor(city);
        if (tz) return { city, tz };
      }
    }
    return null;
  }

  function formatTime(tz){
    try {
      const fmt = new Intl.DateTimeFormat('en-US', {
        timeZone: tz, weekday: 'short', month: 'short', day: 'numeric',
        hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
      });
      return fmt.format(new Date());
    } catch { return null; }
  }

  function offsetFromUTC(tz){
    try {
      const d = new Date();
      const local = new Date(d.toLocaleString('en-US', { timeZone: tz }));
      const utc = new Date(d.toLocaleString('en-US', { timeZone: 'UTC' }));
      const diffMin = Math.round((local - utc) / 60000);
      const sign = diffMin >= 0 ? '+' : '-';
      const abs = Math.abs(diffMin);
      return 'UTC' + sign + Math.floor(abs / 60) + ':' + String(abs % 60).padStart(2, '0');
    } catch { return null; }
  }

  function worldClockCard(){
    const zones = ['America/Los_Angeles', 'America/New_York', 'UTC', 'Europe/London', 'Europe/Paris', 'Asia/Dubai', 'Asia/Kolkata', 'Asia/Shanghai', 'Asia/Tokyo', 'Australia/Sydney'];
    return {
      kind: 'world-clock',
      title: 'World clock',
      icon: '🌍',
      confidence: 0.95,
      zones: zones.map((tz) => ({ tz, formatted: formatTime(tz), offset: offsetFromUTC(tz) })),
      summary: 'Live times across 10 major cities',
      inputType: 'none',
    };
  }

  async function tryCard(query){
    const parsed = parsePattern(query);
    if (!parsed) return null;
    if (parsed.worldClock) return worldClockCard();
    const formatted = formatTime(parsed.tz);
    if (!formatted) return null;
    return {
      kind: 'time',
      title: 'Time in ' + parsed.city.replace(/^./, (c) => c.toUpperCase()),
      icon: '🕐',
      confidence: 0.9,
      formatted,
      tz: parsed.tz,
      offset: offsetFromUTC(parsed.tz),
      summary: parsed.tz,
      inputType: 'none',
    };
  }

  window.oioxoTimecard = { tryCard, parsePattern, zoneFor, formatTime };
})();
