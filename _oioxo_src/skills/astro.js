/**
 * oioxo runtime mirror of lib/skills/astro.ts. Depends on
 * oioxoSkills.weather.geocode (loader resolves it). Moon phase comes from
 * oioxoEngines.moon (no skill needed). Exposes window.oioxoSkills.astro = { getAstro }.
 */
(function(){
  'use strict';
  if (typeof window === 'undefined') return;
  window.oioxoSkills = window.oioxoSkills || {};
  if (window.oioxoSkills.astro) return;

  const CACHE_KEY = 'xonvert.skill.astro.cache.v1';
  const TTL = 6 * 60 * 60 * 1000;

  function readCache(city){
    try { const raw = localStorage.getItem(CACHE_KEY); if (!raw) return null;
      const j = JSON.parse(raw); const e = j && j[city.toLowerCase()];
      if (e && Date.now() - e.t < TTL) return e.d; } catch {} return null;
  }
  function writeCache(city, data){
    try { const raw = localStorage.getItem(CACHE_KEY); const j = raw ? JSON.parse(raw) : {};
      j[city.toLowerCase()] = { t: Date.now(), d: data };
      const keys = Object.keys(j); if (keys.length > 40) for (const k of keys.slice(0, keys.length-40)) delete j[k];
      localStorage.setItem(CACHE_KEY, JSON.stringify(j)); } catch {}
  }
  async function geocode(city){
    if (window.oioxoSkills.weather && window.oioxoSkills.weather.geocode){
      return await window.oioxoSkills.weather.geocode(city);
    }
    if (window.oioxoLoader && window.oioxoLoader.getSkill){
      const wx = await window.oioxoLoader.getSkill('weather');
      if (wx && wx.geocode) return await wx.geocode(city);
    }
    try {
      const r = await fetch('https://geocoding-api.open-meteo.com/v1/search?count=1&language=en&format=json&name=' + encodeURIComponent(city.trim()));
      if (!r.ok) return null;
      const j = await r.json();
      if (!j.results || !j.results.length) return null;
      const r0 = j.results[0];
      return { lat: r0.latitude, lon: r0.longitude, name: r0.name, country: r0.country, tz: r0.timezone };
    } catch { return null; }
  }
  async function getAstro(city, opts){
    if (!city || !city.trim()) return null;
    const key = city.trim().toLowerCase();
    const useCache = !opts || opts.cache !== false;
    if (useCache){ const c = readCache(key); if (c) return c; }
    const geo = await geocode(city);
    if (!geo) return null;
    try {
      const r = await fetch('https://api.open-meteo.com/v1/forecast?latitude=' + geo.lat + '&longitude=' + geo.lon + '&daily=sunrise,sunset,daylight_duration&timezone=' + encodeURIComponent(geo.tz));
      if (!r.ok) return null;
      const j = await r.json();
      if (!j.daily || !j.daily.sunrise) return null;
      const data = { geo, sunrise: j.daily.sunrise[0], sunset: j.daily.sunset[0], daylight: j.daily.daylight_duration[0] };
      if (useCache) writeCache(key, data);
      return data;
    } catch { return null; }
  }
  window.oioxoSkills.astro = { getAstro };
})();
