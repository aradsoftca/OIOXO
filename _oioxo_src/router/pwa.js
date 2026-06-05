/**
 * PWA — registers the service worker (oioxo/sw.js), produces the install
 * prompt, and tracks the offline status.
 *
 *   register()      — kicks off service worker registration
 *   canInstall()    — true once browser-fired the beforeinstallprompt
 *   promptInstall() — show the prompt; resolves with user choice
 *   isOnline()      — current connection state
 *   onOffline(cb) / onOnline(cb)
 *
 * Exposes window.oioxoPwa = { register, canInstall, promptInstall,
 *                              isOnline, onOffline, onOnline }.
 */
(function(){
  'use strict';
  if (typeof window === 'undefined') return;
  if (window.oioxoPwa) return;

  let deferredPrompt = null;
  const onlineListeners = new Set();
  const offlineListeners = new Set();

  if (typeof window.addEventListener === 'function'){
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredPrompt = e;
    });
    window.addEventListener('online', () => { for (const cb of onlineListeners){ try { cb(); } catch {} } });
    window.addEventListener('offline', () => { for (const cb of offlineListeners){ try { cb(); } catch {} } });
  }

  async function register(swUrl){
    if (typeof navigator === 'undefined' || !navigator.serviceWorker) return null;
    try { return await navigator.serviceWorker.register(swUrl || '/sw.js'); }
    catch { return null; }
  }

  function canInstall(){ return !!deferredPrompt; }

  async function promptInstall(){
    if (!deferredPrompt) return null;
    try {
      deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      deferredPrompt = null;
      return choice && choice.outcome;
    } catch { return null; }
  }

  function isOnline(){
    if (typeof navigator === 'undefined') return true;
    return navigator.onLine !== false;
  }

  function onOnline(cb){ if (typeof cb === 'function'){ onlineListeners.add(cb); return () => onlineListeners.delete(cb); } return () => {}; }
  function onOffline(cb){ if (typeof cb === 'function'){ offlineListeners.add(cb); return () => offlineListeners.delete(cb); } return () => {}; }

  window.oioxoPwa = { register, canInstall, promptInstall, isOnline, onOnline, onOffline };
})();
