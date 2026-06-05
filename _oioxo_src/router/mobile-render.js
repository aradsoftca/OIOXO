/**
 * Mobile renderer overrides — when context.surface === 'mobile', wrap
 * normal renderer output with mobile-friendly classes / tighter spacing
 * and inject swipe handlers.
 *
 *   isMobile()                 — heuristic check via UA + viewport
 *   adapt(html, surface)       — wrap with mobile-class when applicable
 *   detectSurface()            — best-guess from environment
 *
 * Exposes window.oioxoMobileRender = { isMobile, adapt, detectSurface }.
 */
(function(){
  'use strict';
  if (typeof window === 'undefined') return;
  if (window.oioxoMobileRender) return;

  function isMobile(){
    if (typeof navigator === 'undefined') return false;
    const ua = navigator.userAgent || '';
    if (/Mobi|Android|iPhone|iPad|iPod/i.test(ua)) return true;
    if (typeof innerWidth === 'number' && innerWidth < 700) return true;
    if (typeof matchMedia === 'function'){
      try { return matchMedia('(max-width: 720px)').matches; } catch {}
    }
    return false;
  }

  function detectSurface(opts){
    if (opts && opts.surface) return opts.surface;
    if (isMobile()) return 'mobile';
    return 'desktop';
  }

  function adapt(html, surface){
    surface = surface || detectSurface();
    if (surface !== 'mobile') return html;
    return '<div class="oioxo-mobile" data-surface="mobile" style="font-size:14px;line-height:1.45">' + html + '</div>';
  }

  window.oioxoMobileRender = { isMobile, adapt, detectSurface };
})();
