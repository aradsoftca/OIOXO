/**
 * oioxo engine: moon phase. Pure on-device Meeus synodic-month algorithm.
 * Reference new moon 2000-01-06 18:14 UTC; synodic month 29.530588853d.
 * Maps cycle fraction → 8 named phases + illumination %.
 *
 * Exposes window.oioxoEngines.moon = { phase, phaseAt }.
 */
(function(){
  'use strict';
  if (typeof window === 'undefined') return;
  window.oioxoEngines = window.oioxoEngines || {};
  if (window.oioxoEngines.moon) return;

  const REF_NEWMOON_UTC = Date.UTC(2000, 0, 6, 18, 14) / 1000;
  const SYNODIC = 29.530588853;

  function classify(frac){
    if (frac < 0.03 || frac > 0.97) return { name: 'New moon', icon: '🌑' };
    if (frac < 0.22) return { name: 'Waxing crescent', icon: '🌒' };
    if (frac < 0.28) return { name: 'First quarter', icon: '🌓' };
    if (frac < 0.47) return { name: 'Waxing gibbous', icon: '🌔' };
    if (frac < 0.53) return { name: 'Full moon', icon: '🌕' };
    if (frac < 0.72) return { name: 'Waning gibbous', icon: '🌖' };
    if (frac < 0.78) return { name: 'Last quarter', icon: '🌗' };
    return { name: 'Waning crescent', icon: '🌘' };
  }

  function phaseAt(date){
    const now = (date instanceof Date ? date : new Date(date || Date.now())).getTime() / 1000;
    let age = ((now - REF_NEWMOON_UTC) % (SYNODIC * 86400)) / 86400;
    if (age < 0) age += SYNODIC;
    const frac = age / SYNODIC;
    const illum = Math.round(((1 - Math.cos(frac * 2 * Math.PI)) / 2) * 100);
    const { name, icon } = classify(frac);
    return { name, icon, illum, age, frac };
  }

  function phase(){ return phaseAt(new Date()); }

  window.oioxoEngines.moon = { phase, phaseAt };
})();
