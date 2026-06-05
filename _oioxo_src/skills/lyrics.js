/**
 * oioxo runtime mirror of lib/skills/lyrics.ts. Exposes
 * window.oioxoSkills.lyrics = { getLyrics }.
 */
(function(){
  'use strict';
  if (typeof window === 'undefined') return;
  window.oioxoSkills = window.oioxoSkills || {};
  if (window.oioxoSkills.lyrics) return;

  const CACHE_KEY = 'xonvert.skill.lyrics.cache.v1';
  const TTL = 30 * 24 * 60 * 60 * 1000;
  const MAX_LEN = 4000;

  function cacheId(a, t){ return a.trim().toLowerCase() + '|' + t.trim().toLowerCase(); }
  function readCache(id){
    try { const raw = localStorage.getItem(CACHE_KEY); if (!raw) return null;
      const j = JSON.parse(raw); const e = j && j[id];
      if (e && Date.now() - e.t < TTL) return e.l; } catch {} return null;
  }
  function writeCache(id, lyrics){
    try { const raw = localStorage.getItem(CACHE_KEY); const j = raw ? JSON.parse(raw) : {};
      j[id] = { t: Date.now(), l: lyrics };
      const keys = Object.keys(j); if (keys.length > 50) for (const k of keys.slice(0, keys.length-50)) delete j[k];
      localStorage.setItem(CACHE_KEY, JSON.stringify(j)); } catch {}
  }
  async function getLyrics(artist, title, opts){
    const a = (artist || '').trim(), t = (title || '').trim();
    if (!a || !t || a.length > 60 || t.length > 80) return null;
    const id = cacheId(a, t);
    const useCache = !opts || opts.cache !== false;
    if (useCache){ const c = readCache(id); if (c) return { artist: a, title: t, lyrics: c }; }
    try {
      const r = await fetch('https://api.lyrics.ovh/v1/' + encodeURIComponent(a) + '/' + encodeURIComponent(t));
      if (!r.ok) return null;
      const j = await r.json();
      if (!j || !j.lyrics) return null;
      let lyrics = j.lyrics.trim().replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n');
      if (lyrics.length > MAX_LEN) lyrics = lyrics.slice(0, MAX_LEN);
      if (lyrics.length < 40) return null;
      if (useCache) writeCache(id, lyrics);
      return { artist: a, title: t, lyrics };
    } catch { return null; }
  }
  window.oioxoSkills.lyrics = { getLyrics };
})();
