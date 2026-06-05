/**
 * Theme manager — light / dark / system mode with CSS custom-property
 * tokens. Persists choice via localStorage, syncs across tabs via the
 * BroadcastChannel API.
 *
 *   set(mode)            — 'light' | 'dark' | 'system'
 *   get()                 — currently active mode
 *   resolved()            — 'light' | 'dark' (system → resolved via matchMedia)
 *   onChange(callback)    — subscribe to changes
 *
 * Exposes window.oioxoTheme = { … }.
 */
(function(){
  'use strict';
  if (typeof window === 'undefined') return;
  if (window.oioxoTheme) return;

  const KEY = 'oioxo.theme.v1';
  const MODES = ['light', 'dark', 'system'];
  const listeners = new Set();

  function get(){
    try {
      if (typeof localStorage === 'undefined') return 'system';
      return localStorage.getItem(KEY) || 'system';
    } catch { return 'system'; }
  }

  function resolved(){
    const mode = get();
    if (mode === 'system'){
      if (typeof matchMedia === 'function'){
        try { return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'; } catch {}
      }
      return 'light';
    }
    return mode;
  }

  function set(mode){
    if (!MODES.includes(mode)) return;
    try { if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, mode); } catch {}
    apply();
    for (const cb of listeners){ try { cb(mode, resolved()); } catch {} }
  }

  function apply(){
    if (typeof document === 'undefined' || !document.documentElement) return;
    const r = resolved();
    document.documentElement.setAttribute('data-theme', r);
    document.documentElement.setAttribute('data-theme-mode', get());
  }

  function onChange(cb){
    if (typeof cb === 'function'){ listeners.add(cb); return () => listeners.delete(cb); }
    return () => {};
  }

  // React to system preference changes when in 'system' mode.
  if (typeof matchMedia === 'function'){
    try {
      const mq = matchMedia('(prefers-color-scheme: dark)');
      const handler = () => { if (get() === 'system'){ apply(); for (const cb of listeners){ try { cb('system', resolved()); } catch {} } } };
      if (mq.addEventListener) mq.addEventListener('change', handler);
      else if (mq.addListener) mq.addListener(handler);
    } catch {}
  }

  // Cross-tab sync via BroadcastChannel when available.
  let bc = null;
  if (typeof BroadcastChannel === 'function'){
    try { bc = new BroadcastChannel('oioxo.theme'); bc.onmessage = (e) => { if (e && e.data && e.data.mode) set(e.data.mode); }; } catch {}
  }

  apply();

  window.oioxoTheme = { set, get, resolved, onChange, MODES };
})();
