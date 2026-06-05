/**
 * oioxo runtime mirror of lib/skills/etymology.ts. Exposes
 * window.oioxoSkills.etymology = { getEtymology }.
 */
(function(){
  'use strict';
  if (typeof window === 'undefined') return;
  window.oioxoSkills = window.oioxoSkills || {};
  if (window.oioxoSkills.etymology) return;

  const CACHE_KEY = 'xonvert.skill.etymology.cache.v1';
  const TTL = 30 * 24 * 60 * 60 * 1000;

  function readCache(word){
    try { const raw = localStorage.getItem(CACHE_KEY); if (!raw) return null;
      const j = JSON.parse(raw); const e = j && j[word.toLowerCase()];
      if (e && Date.now() - e.t < TTL) return e.d; } catch {} return null;
  }
  function writeCache(word, data){
    try { const raw = localStorage.getItem(CACHE_KEY); const j = raw ? JSON.parse(raw) : {};
      j[word.toLowerCase()] = { t: Date.now(), d: data };
      const keys = Object.keys(j); if (keys.length > 200) for (const k of keys.slice(0, keys.length-200)) delete j[k];
      localStorage.setItem(CACHE_KEY, JSON.stringify(j)); } catch {}
  }
  async function getEtymology(word, opts){
    const w = (word || '').trim();
    if (!w || w.length > 30 || !/^[a-zA-Z]+$/.test(w)) return null;
    const key = w.toLowerCase();
    const useCache = !opts || opts.cache !== false;
    if (useCache){ const c = readCache(key); if (c) return c; }
    try {
      const r = await fetch('https://en.wiktionary.org/api/rest_v1/page/html/' + encodeURIComponent(key) + '?redirect=true');
      if (!r.ok) return null;
      const body = await r.text();
      const i = body.search(/<h\d[^>]*id="Etymology[^"]*"[^>]*>/i);
      if (i < 0) return null;
      const chunk = body.slice(i, i + 4000);
      const afterH = chunk.replace(/^<h\d[^>]*>[\s\S]*?<\/h\d>/, '');
      const pMatch = afterH.match(/<p[^>]*>([\s\S]{20,1200}?)<\/p>/i);
      if (!pMatch) return null;
      let text = pMatch[1]
        .replace(/<sup[^>]*>[\s\S]*?<\/sup>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, '')
        .replace(/\[(?:edit|\d+)\]/gi, '')
        .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#\d+;/g, '')
        .replace(/\s+/g, ' ').trim();
      if (text.length < 30) return null;
      if (text.length > 360) text = text.slice(0, 360).replace(/\s\S*$/, '') + '…';
      const yearM = text.match(/\b(1[0-9]{3}|20[0-2]\d)\b/);
      const data = { word: key, text, attestedYear: yearM ? yearM[1] : null };
      if (useCache) writeCache(key, data);
      return data;
    } catch { return null; }
  }
  window.oioxoSkills.etymology = { getEtymology };
})();
