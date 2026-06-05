/**
 * oioxo runtime mirror of lib/skills/weather.ts — hand-ported so the
 * single-file search engine can load it as a classic <script src>.
 * Keep this in sync with the TypeScript source until a build step
 * generates it automatically.
 *
 * Exposes window.oioxoSkills.weather = { getWeather, geocode, describeWMO }.
 */
(function(){
  'use strict';
  if (typeof window === 'undefined') return;
  window.oioxoSkills = window.oioxoSkills || {};
  if (window.oioxoSkills.weather) return;

  const WMO = {
    0:['☀','Clear'], 1:['🌤','Mostly clear'], 2:['⛅','Partly cloudy'], 3:['☁','Overcast'],
    45:['🌫','Fog'], 48:['🌫','Rime fog'],
    51:['🌦','Light drizzle'], 53:['🌦','Drizzle'], 55:['🌧','Heavy drizzle'],
    61:['🌧','Light rain'], 63:['🌧','Rain'], 65:['🌧','Heavy rain'],
    71:['🌨','Light snow'], 73:['🌨','Snow'], 75:['❄','Heavy snow'],
    77:['🌨','Snow grains'],
    80:['🌦','Rain showers'], 81:['🌧','Rain showers'], 82:['⛈','Violent showers'],
    85:['🌨','Snow showers'], 86:['❄','Heavy snow showers'],
    95:['⛈','Thunderstorm'], 96:['⛈','Thunderstorm w/ hail'], 99:['⛈','Severe thunderstorm'],
  };
  const CACHE_KEY = 'xonvert.skill.weather.cache.v1';
  const TTL = 15 * 60 * 1000;

  function readCache(city){
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      const j = JSON.parse(raw);
      const e = j && j[city.toLowerCase()];
      if (e && Date.now() - e.t < TTL) return e.d;
    } catch {}
    return null;
  }
  function writeCache(city, data){
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      const j = raw ? JSON.parse(raw) : {};
      j[city.toLowerCase()] = { t: Date.now(), d: data };
      const keys = Object.keys(j);
      if (keys.length > 50) for (const k of keys.slice(0, keys.length - 50)) delete j[k];
      localStorage.setItem(CACHE_KEY, JSON.stringify(j));
    } catch {}
  }
  function describeWMO(code){
    const e = WMO[code];
    return e ? [e[0], e[1]] : ['🌡','—'];
  }
  async function geocode(city){
    if (!city || !city.trim()) return null;
    try {
      const r = await fetch('https://geocoding-api.open-meteo.com/v1/search?count=1&language=en&format=json&name=' + encodeURIComponent(city.trim()));
      if (!r.ok) return null;
      const j = await r.json();
      if (!j.results || !j.results.length) return null;
      const r0 = j.results[0];
      return { lat: r0.latitude, lon: r0.longitude, name: r0.name, country: r0.country, tz: r0.timezone };
    } catch { return null; }
  }
  async function getWeather(city, opts){
    if (!city || !city.trim()) return null;
    const key = city.trim().toLowerCase();
    const useCache = !opts || opts.cache !== false;
    if (useCache){ const c = readCache(key); if (c) return c; }
    const geo = await geocode(city);
    if (!geo) return null;
    try {
      const r = await fetch('https://api.open-meteo.com/v1/forecast?latitude=' + geo.lat + '&longitude=' + geo.lon + '&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m,apparent_temperature&daily=temperature_2m_max,temperature_2m_min&timezone=' + encodeURIComponent(geo.tz));
      if (!r.ok) return null;
      const j = await r.json();
      if (!j.current) return null;
      const data = { geo: geo, cur: j.current, daily: j.daily };
      if (useCache) writeCache(key, data);
      return data;
    } catch { return null; }
  }
  window.oioxoSkills.weather = { getWeather, geocode, describeWMO };
})();
