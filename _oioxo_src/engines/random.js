/**
 * oioxo engine: cryptographic random helpers. Pure on-device. Wraps
 * window.crypto.getRandomValues with friendly helpers.
 *
 * Exposes window.oioxoEngines.random = {
 *   int(max), between(lo, hi), pick(arr), flip(), roll(count, sides), bytes(n)
 * }
 */
(function(){
  'use strict';
  if (typeof window === 'undefined') return;
  window.oioxoEngines = window.oioxoEngines || {};
  if (window.oioxoEngines.random) return;

  function rand(max){
    if (window.crypto && window.crypto.getRandomValues){
      const a = new Uint32Array(1);
      window.crypto.getRandomValues(a);
      return a[0] % max;
    }
    return Math.floor(Math.random() * max);
  }

  function int(max){
    if (!Number.isFinite(max) || max <= 0) return 0;
    return rand(Math.floor(max));
  }

  function between(lo, hi){
    const a = Math.min(lo, hi);
    const b = Math.max(lo, hi);
    if (b - a > 1e9) return null;
    return a + rand(b - a + 1);
  }

  function pick(arr){
    if (!Array.isArray(arr) || !arr.length) return null;
    return arr[rand(arr.length)];
  }

  function flip(){
    return rand(2) === 0 ? 'Heads' : 'Tails';
  }

  function roll(count, sides){
    count = Math.max(1, Math.min(50, count|0));
    sides = Math.max(2, Math.min(1000, sides|0));
    const rolls = [];
    let total = 0;
    for (let i = 0; i < count; i++){
      const r = rand(sides) + 1;
      rolls.push(r);
      total += r;
    }
    return { rolls, total, count, sides };
  }

  function bytes(n){
    if (!Number.isFinite(n) || n <= 0 || n > 65536) return null;
    const out = new Uint8Array(n);
    if (window.crypto && window.crypto.getRandomValues) window.crypto.getRandomValues(out);
    else for (let i = 0; i < n; i++) out[i] = Math.floor(Math.random() * 256);
    return out;
  }

  window.oioxoEngines.random = { int, between, pick, flip, roll, bytes };
})();
