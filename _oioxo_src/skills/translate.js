/**
 * oioxo runtime mirror of lib/skills/translate.ts. Exposes
 * window.oioxoSkills.translate = { translate, detectSourceLang, resolveLangCode, LANG_NAMES }.
 */
(function(){
  'use strict';
  if (typeof window === 'undefined') return;
  window.oioxoSkills = window.oioxoSkills || {};
  if (window.oioxoSkills.translate) return;

  const LANG_NAMES = {
    en:'English', es:'Spanish', fr:'French', de:'German', it:'Italian',
    pt:'Portuguese', nl:'Dutch', sv:'Swedish', da:'Danish', no:'Norwegian',
    fi:'Finnish', pl:'Polish', ru:'Russian', uk:'Ukrainian', cs:'Czech',
    el:'Greek', ro:'Romanian', hu:'Hungarian', tr:'Turkish', ar:'Arabic',
    he:'Hebrew', fa:'Persian', ur:'Urdu', hi:'Hindi', bn:'Bengali',
    ta:'Tamil', ja:'Japanese', ko:'Korean', zh:'Chinese', th:'Thai',
    vi:'Vietnamese', id:'Indonesian', ms:'Malay', sw:'Swahili', tl:'Filipino', la:'Latin',
  };
  const NAME_TO_CODE = {
    english:'en', spanish:'es', french:'fr', german:'de', italian:'it',
    portuguese:'pt', dutch:'nl', swedish:'sv', danish:'da', norwegian:'no',
    finnish:'fi', polish:'pl', russian:'ru', ukrainian:'uk', czech:'cs',
    greek:'el', romanian:'ro', hungarian:'hu', turkish:'tr', arabic:'ar',
    hebrew:'he', persian:'fa', farsi:'fa', urdu:'ur', hindi:'hi', bengali:'bn',
    tamil:'ta', japanese:'ja', korean:'ko', chinese:'zh', mandarin:'zh',
    thai:'th', vietnamese:'vi', indonesian:'id', malay:'ms', swahili:'sw',
    filipino:'tl', tagalog:'tl', latin:'la',
  };
  const CACHE_KEY = 'xonvert.skill.translate.cache.v1';
  const TTL = 24 * 60 * 60 * 1000;

  function resolveLangCode(input){
    const k = (input || '').trim().toLowerCase();
    if (!k) return null;
    if (LANG_NAMES[k]) return k;
    return NAME_TO_CODE[k] || null;
  }
  function detectSourceLang(text){
    if (!text) return 'en';
    if (/[一-鿿]/.test(text)) return 'zh';
    if (/[぀-ヿ]/.test(text)) return 'ja';
    if (/[가-힯]/.test(text)) return 'ko';
    if (/[؀-ۿ]/.test(text)) return 'ar';
    if (/[Ѐ-ӿ]/.test(text)) return 'ru';
    if (/[ऀ-ॿ]/.test(text)) return 'hi';
    if (/[àâçéèêëîïôœùûüÿæ]/i.test(text)) return 'fr';
    if (/[äöüß]/i.test(text)) return 'de';
    if (/[áéíóúñ¿¡]/i.test(text)) return 'es';
    return 'en';
  }
  function readCache(id){
    try { const raw = localStorage.getItem(CACHE_KEY); if (!raw) return null;
      const j = JSON.parse(raw); const e = j && j[id];
      if (e && Date.now() - e.t < TTL) return e.d; } catch {} return null;
  }
  function writeCache(id, data){
    try { const raw = localStorage.getItem(CACHE_KEY); const j = raw ? JSON.parse(raw) : {};
      j[id] = { t: Date.now(), d: data };
      const keys = Object.keys(j); if (keys.length > 120) for (const k of keys.slice(0, keys.length-120)) delete j[k];
      localStorage.setItem(CACHE_KEY, JSON.stringify(j)); } catch {}
  }
  async function translate(text, to, opts){
    const src = (text || '').trim();
    if (!src || src.length > 500) return null;
    const tCode = resolveLangCode(to);
    if (!tCode) return null;
    const fCode = (opts && opts.from) ? resolveLangCode(opts.from) : detectSourceLang(src);
    if (!fCode || fCode === tCode) return null;
    const id = fCode + '>' + tCode + ':' + src.slice(0, 100).toLowerCase();
    const useCache = !opts || opts.cache !== false;
    if (useCache){ const c = readCache(id); if (c) return c; }
    try {
      const r = await fetch('https://api.mymemory.translated.net/get?langpair=' + encodeURIComponent(fCode+'|'+tCode) + '&q=' + encodeURIComponent(src));
      if (!r.ok) return null;
      const j = await r.json();
      if (!j || !j.responseData || !j.responseData.translatedText) return null;
      const translation = j.responseData.translatedText;
      if (!translation || translation.toLowerCase() === src.toLowerCase()) return null;
      const data = { source: src, translation, from: fCode, to: tCode, match: j.responseData.match || 0 };
      if (useCache) writeCache(id, data);
      return data;
    } catch { return null; }
  }
  window.oioxoSkills.translate = { translate, detectSourceLang, resolveLangCode, LANG_NAMES };
})();
