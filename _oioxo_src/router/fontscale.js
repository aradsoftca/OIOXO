/**
 * Font-scale — user-controlled root font size for accessibility. Persists
 * choice. Steps: 0.9 / 1.0 / 1.1 / 1.25 / 1.5.
 *
 *   set(scale)
 *   get()
 *   increase() / decrease()
 *   apply()    — re-applies to the root element
 *
 * Exposes window.oioxoFontscale = { … }.
 */
(function(){
  'use strict';
  if (typeof window === 'undefined') return;
  if (window.oioxoFontscale) return;

  const KEY = 'oioxo.fontscale.v1';
  const STEPS = [0.9, 1.0, 1.1, 1.25, 1.5];
  const DEFAULT = 1.0;

  function get(){
    try {
      if (typeof localStorage === 'undefined') return DEFAULT;
      const v = parseFloat(localStorage.getItem(KEY));
      return isFinite(v) && STEPS.includes(v) ? v : DEFAULT;
    } catch { return DEFAULT; }
  }

  function set(scale){
    if (!STEPS.includes(scale)) return false;
    try { if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, String(scale)); } catch {}
    apply();
    return true;
  }

  function apply(){
    if (typeof document === 'undefined' || !document.documentElement) return;
    document.documentElement.style.fontSize = (16 * get()) + 'px';
    document.documentElement.setAttribute('data-font-scale', String(get()));
  }

  function increase(){
    const idx = STEPS.indexOf(get());
    if (idx >= 0 && idx < STEPS.length - 1) return set(STEPS[idx + 1]);
    return false;
  }

  function decrease(){
    const idx = STEPS.indexOf(get());
    if (idx > 0) return set(STEPS[idx - 1]);
    return false;
  }

  apply();

  window.oioxoFontscale = { get, set, apply, increase, decrease, STEPS };
})();
