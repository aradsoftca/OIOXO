/**
 * oioxo runtime mirror of lib/skills/holidays.ts — keep in sync.
 * Exposes window.oioxoSkills.holidays = { getHolidays, resolveCountryCode, COUNTRY_ISO2 }.
 */
(function(){
  'use strict';
  if (typeof window === 'undefined') return;
  window.oioxoSkills = window.oioxoSkills || {};
  if (window.oioxoSkills.holidays) return;

  const COUNTRY_ISO2 = {
    us:'US', usa:'US', 'united states':'US', america:'US',
    uk:'GB', 'united kingdom':'GB', britain:'GB', england:'GB', 'great britain':'GB',
    canada:'CA', mexico:'MX', brazil:'BR', argentina:'AR', chile:'CL', colombia:'CO', peru:'PE',
    france:'FR', germany:'DE', spain:'ES', italy:'IT', portugal:'PT', netherlands:'NL', belgium:'BE',
    switzerland:'CH', austria:'AT', sweden:'SE', norway:'NO', denmark:'DK', finland:'FI', iceland:'IS',
    ireland:'IE', poland:'PL', 'czech republic':'CZ', czechia:'CZ', slovakia:'SK', hungary:'HU',
    greece:'GR', romania:'RO', bulgaria:'BG', ukraine:'UA', russia:'RU',
    turkey:'TR', israel:'IL',
    japan:'JP', 'south korea':'KR', korea:'KR', china:'CN', taiwan:'TW', 'hong kong':'HK', singapore:'SG',
    india:'IN', pakistan:'PK', bangladesh:'BD', indonesia:'ID', thailand:'TH', vietnam:'VN', philippines:'PH', malaysia:'MY',
    australia:'AU', 'new zealand':'NZ',
    'south africa':'ZA', egypt:'EG', nigeria:'NG', kenya:'KE', morocco:'MA',
    'saudi arabia':'SA', uae:'AE', 'united arab emirates':'AE', qatar:'QA',
  };
  const CACHE_KEY = 'xonvert.skill.holidays.cache.v1';
  const TTL = 24 * 60 * 60 * 1000;

  function resolveCountryCode(input){ return COUNTRY_ISO2[(input || '').trim().toLowerCase()] || null; }
  function readCache(code, year){
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      const j = JSON.parse(raw);
      const e = j && j[code + ':' + year];
      if (e && Date.now() - e.t < TTL) return e.d;
    } catch {}
    return null;
  }
  function writeCache(code, year, data){
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      const j = raw ? JSON.parse(raw) : {};
      j[code + ':' + year] = { t: Date.now(), d: data };
      const keys = Object.keys(j);
      if (keys.length > 60) for (const k of keys.slice(0, keys.length - 60)) delete j[k];
      localStorage.setItem(CACHE_KEY, JSON.stringify(j));
    } catch {}
  }
  async function getHolidays(countryInput, year, opts){
    const yr = year || new Date().getFullYear();
    const code = /^[A-Za-z]{2}$/.test(countryInput) ? countryInput.toUpperCase() : resolveCountryCode(countryInput);
    if (!code) return null;
    const useCache = !opts || opts.cache !== false;
    let holidays = null;
    if (useCache) holidays = readCache(code, yr);
    if (!holidays){
      try {
        const r = await fetch('https://date.nager.at/api/v3/PublicHolidays/' + yr + '/' + code);
        if (!r.ok) return null;
        const arr = await r.json();
        if (!Array.isArray(arr) || !arr.length) return null;
        holidays = arr.map(h => ({ date: h.date, localName: h.localName, name: h.name, countryCode: h.countryCode, global: h.global !== false }));
        if (useCache) writeCache(code, yr, holidays);
      } catch { return null; }
    }
    const today = new Date(); today.setUTCHours(0,0,0,0);
    const upcoming = holidays.filter(h => new Date(h.date + 'T00:00:00Z') >= today).slice(0, 5);
    const country = Object.keys(COUNTRY_ISO2).find(k => COUNTRY_ISO2[k] === code) || code;
    return { country, countryCode: code, year: yr, holidays, upcoming };
  }
  window.oioxoSkills.holidays = { getHolidays, resolveCountryCode, COUNTRY_ISO2 };
})();
