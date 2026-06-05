/**
 * RTL helper — flips the rendered card direction for RTL languages
 * (Arabic, Hebrew, Persian, Urdu) and provides Intl-locale-aware
 * formatting helpers used by i18n-render.js.
 *
 *   isRTL(lang) → boolean
 *   wrap(html, lang) → '<div dir="rtl">…</div>' for RTL languages
 *   align(lang) → 'right' | 'left'
 *
 * Exposes window.oioxoRtl = { isRTL, wrap, align, RTL_LANGS }.
 */
(function(){
  'use strict';
  if (typeof window === 'undefined') return;
  if (window.oioxoRtl) return;

  const RTL_LANGS = new Set([
    'ar','he','fa','ur','yi','ps','sd','dv','ku','ckb','arc','syr','iw',
  ]);

  function isRTL(lang){
    if (!lang) return false;
    return RTL_LANGS.has(String(lang).toLowerCase().split(/[-_]/)[0]);
  }

  function wrap(html, lang){
    if (!isRTL(lang)) return html;
    return '<div dir="rtl" lang="' + String(lang).toLowerCase() + '" style="text-align:right">' + html + '</div>';
  }

  function align(lang){ return isRTL(lang) ? 'right' : 'left'; }

  window.oioxoRtl = { isRTL, wrap, align, RTL_LANGS };
})();
