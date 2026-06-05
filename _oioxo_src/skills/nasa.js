/**
 * oioxo runtime mirror of lib/skills/nasa.ts. Exposes window.oioxoSkills.nasa = { getApod }.
 */
(function(){
  'use strict';
  if (typeof window === 'undefined') return;
  window.oioxoSkills = window.oioxoSkills || {};
  if (window.oioxoSkills.nasa) return;

  const CACHE_KEY = 'xonvert.skill.nasa.cache.v1';
  const TTL = 6 * 60 * 60 * 1000;

  function readCache(){
    try { const raw = localStorage.getItem(CACHE_KEY); if (!raw) return null;
      const j = JSON.parse(raw); if (j && j.t && Date.now() - j.t < TTL) return j.d; } catch {} return null;
  }
  function writeCache(data){ try { localStorage.setItem(CACHE_KEY, JSON.stringify({ t: Date.now(), d: data })); } catch {} }

  async function getApod(opts){
    const useCache = !opts || opts.cache !== false;
    if (useCache){ const c = readCache(); if (c) return c; }
    try {
      const r = await fetch('https://api.nasa.gov/planetary/apod?api_key=DEMO_KEY');
      if (!r.ok) return null;
      const j = await r.json();
      if (!j || !j.title) return null;
      const data = { date: j.date, title: j.title, explanation: j.explanation || '', url: j.url, hdurl: j.hdurl, media_type: j.media_type, copyright: j.copyright };
      if (useCache) writeCache(data);
      return data;
    } catch { return null; }
  }
  window.oioxoSkills.nasa = { getApod };
})();
