/**
 * oioxo runtime mirror of lib/skills/pronounce.ts. Exposes
 * window.oioxoSkills.pronounce = { getPronunciation }.
 */
(function(){
  'use strict';
  if (typeof window === 'undefined') return;
  window.oioxoSkills = window.oioxoSkills || {};
  if (window.oioxoSkills.pronounce) return;

  const CACHE_KEY = 'xonvert.skill.pronounce.cache.v1';
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
  async function getPronunciation(word, opts){
    const w = (word || '').trim();
    if (!w || w.length > 40) return null;
    if (!/^[\p{L}'\- ]+$/u.test(w)) return null;
    const tokens = w.split(/\s+/);
    if (tokens.length > 3) return null;
    const key = w.toLowerCase();
    const useCache = !opts || opts.cache !== false;
    if (useCache){ const c = readCache(key); if (c) return c; }
    try {
      const r = await fetch('https://en.wiktionary.org/api/rest_v1/page/html/' + encodeURIComponent(w) + '?redirect=true');
      if (!r.ok) return null;
      const html = await r.text();
      const m = html.match(/<span\s+class="IPA"[^>]*>([^<]{2,120})<\/span>/);
      const ipa = m ? m[1].replace(/&#x2F;/g, '/').replace(/&amp;/g, '&').trim() : null;
      let langTag = 'en';
      if (/id="French"/i.test(html)) langTag = 'fr';
      else if (/id="German"/i.test(html)) langTag = 'de';
      else if (/id="Spanish"/i.test(html)) langTag = 'es';
      else if (/id="Italian"/i.test(html)) langTag = 'it';
      else if (/id="Japanese"/i.test(html)) langTag = 'ja';
      else if (/id="Portuguese"/i.test(html)) langTag = 'pt';
      const data = { word: w, ipa, langTag };
      if (useCache) writeCache(key, data);
      return data;
    } catch { return null; }
  }
  window.oioxoSkills.pronounce = { getPronunciation };
})();
