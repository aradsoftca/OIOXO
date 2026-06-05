/**
 * Accessibility helpers — keeps the SERP screen-reader friendly without
 * baking a11y into every renderer. The renderer (and any external UI)
 * can call these to:
 *
 *   announce(text, priority)     — push text into a polite/assertive ARIA live region
 *   describeEnvelope(env)         — short SR-friendly sentence for the whole SERP
 *   describeIntent(intent, env)   — SR-friendly sentence for a single card
 *   describeAnswer(aiAnswer)      — synthesised answer with citation count
 *   liveRegionProps(role)         — props bag for React/Vue: aria-live, aria-atomic, role
 *   keyMap(handlers)              — registers /, Ctrl+K, j/k, Enter, Escape
 *   focusStreamUpdate(el)         — moves focus + announces in one call
 *   reduceMotion()                — true if user prefers reduced motion
 *
 * Exposes window.oioxoA11y = { … }.
 */
(function(){
  'use strict';
  if (typeof window === 'undefined') return;
  if (window.oioxoA11y) return;

  let liveRegionEl = null;
  let assertiveRegionEl = null;

  function ensureRegion(priority){
    if (typeof document === 'undefined') return null;
    const id = priority === 'assertive' ? 'oioxo-live-assertive' : 'oioxo-live-polite';
    let el = document.getElementById && document.getElementById(id);
    if (el) return el;
    el = document.createElement('div');
    el.id = id;
    el.setAttribute('aria-live', priority || 'polite');
    el.setAttribute('aria-atomic', 'true');
    el.setAttribute('role', 'status');
    // Visually hidden but screen-reader available.
    if (el.style){
      el.style.position = 'absolute';
      el.style.width = '1px'; el.style.height = '1px';
      el.style.padding = '0'; el.style.margin = '-1px';
      el.style.overflow = 'hidden'; el.style.clip = 'rect(0,0,0,0)';
      el.style.whiteSpace = 'nowrap'; el.style.border = '0';
    }
    if (document.body && document.body.appendChild) document.body.appendChild(el);
    if (priority === 'assertive') assertiveRegionEl = el;
    else liveRegionEl = el;
    return el;
  }

  function announce(text, priority){
    if (!text) return;
    const el = ensureRegion(priority || 'polite');
    if (!el) return;
    // Toggle textContent so SRs re-announce identical strings.
    el.textContent = '';
    setTimeout(() => { el.textContent = String(text); }, 30);
  }

  function liveRegionProps(priority){
    return {
      'aria-live': priority || 'polite',
      'aria-atomic': 'true',
      role: 'status',
    };
  }

  function describeIntent(intent, envelope){
    if (!intent) return '';
    const kind = intent.kind || 'result';
    if (kind === 'compute-math') return 'Math answer: ' + (intent.formatted != null ? intent.formatted : intent.result);
    if (kind === 'time') return 'Time: ' + (intent.formatted || intent.summary);
    if (kind === 'world-clock') return 'World clock across ' + (intent.zones ? intent.zones.length : 0) + ' cities.';
    if (kind === 'definition'){
      const sense = intent.senses && intent.senses[0];
      return 'Definition of ' + (intent.title || '') + (sense ? ': ' + (sense.definitions && sense.definitions[0] && sense.definitions[0].text || '') : '');
    }
    if (kind === 'translate') return 'Translated to ' + (intent.targetName || '') + ': ' + (intent.formatted || '');
    if (kind === 'finance') return (intent.title || '') + ': ' + (intent.formatted || '') + (intent.summary ? ', ' + intent.summary : '');
    if (kind === 'news') return (intent.headlines || []).length + ' news headlines. Top: ' + ((intent.headlines || [])[0] && intent.headlines[0].title || '');
    if (kind === 'no-result') return 'No exact match. ' + ((intent.alternatives || []).length + 1) + ' closest tools.';
    if (kind === 'disambiguation') return intent.title + ' Pick from ' + (intent.senses || []).length + ' meanings.';
    const tool = intent.tool && intent.tool.name;
    if (tool) return tool + (intent.snippet ? '. ' + intent.snippet : '.');
    return intent.title || 'Result.';
  }

  function describeAnswer(aiAnswer){
    if (!aiAnswer || !aiAnswer.answer) return '';
    const cites = (aiAnswer.citations || []).length;
    return 'Synthesised answer with ' + cites + ' source' + (cites === 1 ? '' : 's') + ': ' + aiAnswer.answer.replace(/\[\d+\]/g, '').trim();
  }

  function describeEnvelope(env){
    if (!env) return '';
    const parts = [];
    if (env.intent) parts.push(describeIntent(env.intent, env));
    if (env.aiAnswer) parts.push(describeAnswer(env.aiAnswer));
    if (env.webResults && env.webResults.results && env.webResults.results.length){
      parts.push(env.webResults.results.length + ' web results.');
    }
    if (env.suggestions && env.suggestions.length){
      parts.push(env.suggestions.length + ' suggestions.');
    }
    return parts.join(' ');
  }

  /** Lightweight keyboard map. handlers may include slash (/ to focus input),
   *  paletteOpen (Ctrl/Cmd+K), next (j), prev (k), select (Enter), dismiss
   *  (Escape). Returns a detach fn. */
  function keyMap(handlers){
    if (typeof document === 'undefined') return () => {};
    handlers = handlers || {};
    function onKey(e){
      const tag = (e.target && e.target.tagName || '').toLowerCase();
      const inEditable = tag === 'input' || tag === 'textarea' || (e.target && e.target.isContentEditable);
      if (e.key === '/' && !inEditable){ if (handlers.slash){ e.preventDefault(); handlers.slash(e); } return; }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k'){ if (handlers.paletteOpen){ e.preventDefault(); handlers.paletteOpen(e); } return; }
      if (e.key === 'Escape'){ if (handlers.dismiss) handlers.dismiss(e); return; }
      if (inEditable) return;
      if (e.key === 'j' || e.key === 'ArrowDown'){ if (handlers.next){ e.preventDefault(); handlers.next(e); } return; }
      if (e.key === 'k' || e.key === 'ArrowUp'){ if (handlers.prev){ e.preventDefault(); handlers.prev(e); } return; }
      if (e.key === 'Enter'){ if (handlers.select) handlers.select(e); return; }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }

  /** Move focus to an element AND announce a description in one call. */
  function focusStreamUpdate(el, message){
    if (!el) return;
    try { if (typeof el.focus === 'function') el.focus({ preventScroll: false }); } catch {}
    if (message) announce(message, 'polite');
  }

  function reduceMotion(){
    if (typeof matchMedia !== 'function') return false;
    try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
  }

  window.oioxoA11y = {
    announce, liveRegionProps, describeIntent, describeAnswer, describeEnvelope,
    keyMap, focusStreamUpdate, reduceMotion,
  };
})();
