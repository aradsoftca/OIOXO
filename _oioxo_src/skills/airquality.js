/**
 * oioxo runtime mirror of lib/skills/airquality.ts — depends on
 * oioxoSkills.weather.geocode (must load that first, or the loader resolves
 * it on demand). Exposes window.oioxoSkills.airquality = { getAirQuality, describeAqi }.
 */
(function(){
  'use strict';
  if (typeof window === 'undefined') return;
  window.oioxoSkills = window.oioxoSkills || {};
  if (window.oioxoSkills.airquality) return;

  const CACHE_KEY = 'xonvert.skill.airquality.cache.v1';
  const TTL = 30 * 60 * 1000;

  function describeAqi(aqi){
    if (aqi <= 20) return { band:'good', label:'Good', color:'#16a34a', advice:'Air is healthy for outdoor activity.' };
    if (aqi <= 40) return { band:'fair', label:'Fair', color:'#65a30d', advice:'Air is acceptable; sensitive groups should monitor.' };
    if (aqi <= 60) return { band:'moderate', label:'Moderate', color:'#ca8a04', advice:'Sensitive groups should consider reducing prolonged outdoor exertion.' };
    if (aqi <= 80) return { band:'poor', label:'Poor', color:'#ea580c', advice:'Reduce prolonged outdoor exertion, especially if you have respiratory conditions.' };
    if (aqi <= 100) return { band:'very-poor', label:'Very poor', color:'#dc2626', advice:'Avoid outdoor exertion. Sensitive groups should stay indoors.' };
    return { band:'extreme', label:'Extremely poor', color:'#7f1d1d', advice:'Stay indoors. Run an air filter if available.' };
  }
  function readCache(city){
    try { const raw = localStorage.getItem(CACHE_KEY); if (!raw) return null;
      const j = JSON.parse(raw); const e = j && j[city.toLowerCase()];
      if (e && Date.now() - e.t < TTL) return e.d; } catch {} return null;
  }
  function writeCache(city, data){
    try { const raw = localStorage.getItem(CACHE_KEY); const j = raw ? JSON.parse(raw) : {};
      j[city.toLowerCase()] = { t: Date.now(), d: data };
      const keys = Object.keys(j); if (keys.length > 50) for (const k of keys.slice(0, keys.length-50)) delete j[k];
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
    // Direct call as a last resort
    try {
      const r = await fetch('https://geocoding-api.open-meteo.com/v1/search?count=1&language=en&format=json&name=' + encodeURIComponent(city.trim()));
      if (!r.ok) return null;
      const j = await r.json();
      if (!j.results || !j.results.length) return null;
      const r0 = j.results[0];
      return { lat: r0.latitude, lon: r0.longitude, name: r0.name, country: r0.country, tz: r0.timezone };
    } catch { return null; }
  }
  async function getAirQuality(city, opts){
    if (!city || !city.trim()) return null;
    const key = city.trim().toLowerCase();
    const useCache = !opts || opts.cache !== false;
    if (useCache){ const c = readCache(key); if (c) return c; }
    const geo = await geocode(city);
    if (!geo) return null;
    try {
      const r = await fetch('https://air-quality-api.open-meteo.com/v1/air-quality?latitude=' + geo.lat + '&longitude=' + geo.lon + '&current=european_aqi,pm2_5,pm10,ozone,nitrogen_dioxide');
      if (!r.ok) return null;
      const j = await r.json();
      if (!j.current) return null;
      const data = { geo: { lat: geo.lat, lon: geo.lon, name: geo.name, country: geo.country }, cur: j.current };
      if (useCache) writeCache(key, data);
      return data;
    } catch { return null; }
  }
  window.oioxoSkills.airquality = { getAirQuality, describeAqi };
})();
