/**
 * oioxo runtime mirror of lib/skills/currency.ts — keep in sync.
 * Exposes window.oioxoSkills.currency = { getRates, convert, normalizeCode }.
 */
(function(){
  'use strict';
  if (typeof window === 'undefined') return;
  window.oioxoSkills = window.oioxoSkills || {};
  if (window.oioxoSkills.currency) return;

  const SYMBOL = { '$':'USD', '€':'EUR', '£':'GBP', '¥':'JPY' };
  const CACHE_KEY = 'xonvert.skill.currency.cache.v1';
  const TTL = 4 * 60 * 60 * 1000;

  function normalizeCode(code){ return SYMBOL[code] || String(code || '').toUpperCase(); }
  function readCache(){
    try { const raw = localStorage.getItem(CACHE_KEY); if (!raw) return null;
      const j = JSON.parse(raw);
      if (j && j.rates && j.fetched && Date.now() - j.fetched < TTL) return j;
    } catch {} return null;
  }
  function writeCache(data){ try { localStorage.setItem(CACHE_KEY, JSON.stringify(data)); } catch {} }

  async function getRates(opts){
    const useCache = !opts || opts.cache !== false;
    if (useCache){ const c = readCache(); if (c) return c; }
    try {
      const r = await fetch('https://api.frankfurter.app/latest?from=USD');
      if (!r.ok) return null;
      const j = await r.json();
      if (!j || !j.rates) return null;
      const data = { rates: Object.assign({ USD: 1 }, j.rates), date: j.date, fetched: Date.now() };
      if (useCache) writeCache(data);
      return data;
    } catch { return null; }
  }
  async function convert(amount, from, to, opts){
    if (!isFinite(amount)) return null;
    const f = normalizeCode(from), t = normalizeCode(to);
    if (!/^[A-Z]{3}$/.test(f) || !/^[A-Z]{3}$/.test(t)) return null;
    if (f === t) return { amount, from: f, to: t, result: amount, rate: 1, date: new Date().toISOString().slice(0,10) };
    const rates = await getRates(opts);
    if (!rates) return null;
    if (rates.rates[f] === undefined || rates.rates[t] === undefined) return null;
    const rate = rates.rates[t] / rates.rates[f];
    return { amount, from: f, to: t, result: amount * rate, rate, date: rates.date };
  }
  window.oioxoSkills.currency = { getRates, convert, normalizeCode };
})();
