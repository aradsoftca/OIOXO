/**
 * oioxo runtime mirror of lib/skills/country.ts — keep in sync.
 * Exposes window.oioxoSkills.country = { getCountry }.
 */
(function(){
  'use strict';
  if (typeof window === 'undefined') return;
  window.oioxoSkills = window.oioxoSkills || {};
  if (window.oioxoSkills.country) return;

  const CACHE_KEY = 'xonvert.skill.country.cache.v1';
  const TTL = 7 * 24 * 60 * 60 * 1000;

  function readCache(q){
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      const j = JSON.parse(raw);
      const e = j && j[q];
      if (!e) return null;
      if (Date.now() - e.t >= TTL) return null;
      return e.miss ? { miss: true } : { profile: e.d };
    } catch {}
    return null;
  }
  function writeCache(q, val){
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      const j = raw ? JSON.parse(raw) : {};
      j[q] = val.miss ? { t: Date.now(), miss: true } : { t: Date.now(), d: val.profile };
      const keys = Object.keys(j);
      if (keys.length > 200) for (const k of keys.slice(0, keys.length - 200)) delete j[k];
      localStorage.setItem(CACHE_KEY, JSON.stringify(j));
    } catch {}
  }
  function shape(raw){
    const name = raw.name || {};
    const idd = raw.idd && raw.idd.root ? raw.idd.root + ((raw.idd.suffixes && raw.idd.suffixes[0]) || '') : '';
    return {
      name: { common: name.common || '', official: name.official || name.common || '' },
      flag: raw.flag || '',
      capital: (raw.capital && raw.capital[0]) || '—',
      population: raw.population ? raw.population.toLocaleString() : '—',
      area: raw.area ? raw.area.toLocaleString() + ' km²' : '—',
      languages: raw.languages ? Object.values(raw.languages).slice(0,3).join(', ') : '—',
      currencies: raw.currencies ? Object.entries(raw.currencies).map(([code,c]) => code + ' (' + (c.symbol||code) + ')').slice(0,2).join(', ') : '—',
      region: raw.subregion || raw.region || '—',
      callingCode: idd,
      drivingSide: (raw.car && raw.car.side) || '',
      cca2: raw.cca2 || '',
      raw: raw,
    };
  }
  async function getCountry(query, opts){
    if (!query) return null;
    const q = String(query).trim().toLowerCase();
    if (!q) return null;
    const useCache = !opts || opts.cache !== false;
    if (useCache){
      const cached = readCache(q);
      if (cached){ if (cached.miss) return null; return cached.profile || null; }
    }
    try {
      const r = await fetch('https://restcountries.com/v3.1/name/' + encodeURIComponent(q) + '?fields=name,cca2,capital,population,area,region,subregion,languages,currencies,flag,timezones,car,idd,maps,borders');
      if (!r.ok){ if (useCache) writeCache(q, { miss: true }); return null; }
      const arr = await r.json();
      if (!Array.isArray(arr) || !arr.length){ if (useCache) writeCache(q, { miss: true }); return null; }
      const exact = arr.find(c => c && c.name && c.name.common && c.name.common.toLowerCase() === q);
      const profile = shape(exact || arr[0]);
      if (useCache) writeCache(q, { profile });
      return profile;
    } catch { return null; }
  }
  window.oioxoSkills.country = { getCountry };
})();
