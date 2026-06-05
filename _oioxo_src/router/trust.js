/**
 * Trust badges + per-result reasons. Wraps authority + phishing into a
 * user-friendly badge the renderer can put on every web result.
 *
 *   evaluate(url)  → { level: 'high' | 'neutral' | 'low' | 'risky', reasons: [] }
 *   badge(level)   → '🟢' | '⚪' | '🟡' | '🔴'
 *
 * Exposes window.oioxoTrust = { evaluate, badge }.
 */
(function(){
  'use strict';
  if (typeof window === 'undefined') return;
  if (window.oioxoTrust) return;

  function evaluate(url){
    const reasons = [];
    let level = 'neutral';
    if (window.oioxoAuthority && window.oioxoAuthority.bucket){
      const b = window.oioxoAuthority.bucket(url);
      if (b === 'high'){ level = 'high'; reasons.push('high-authority-domain'); }
      else if (b === 'low'){ level = 'low'; reasons.push('low-authority-domain'); }
    }
    if (window.oioxoPhishing && window.oioxoPhishing.isSuspicious && window.oioxoPhishing.isSuspicious(url)){
      level = 'risky';
      const why = window.oioxoPhishing.why(url);
      reasons.push(...why);
    }
    return { level, reasons };
  }

  function badge(level){
    return level === 'high' ? '🟢' : level === 'low' ? '🟡' : level === 'risky' ? '🔴' : '⚪';
  }

  window.oioxoTrust = { evaluate, badge };
})();
