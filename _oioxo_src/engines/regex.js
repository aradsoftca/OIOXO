/**
 * oioxo engine: regex tester. Pure on-device. Wraps native RegExp.
 *
 * Exposes window.oioxoEngines.regex = { test, parsePattern }.
 *
 *   parsePattern('/foo/gi test string') -> { pattern, flags, test }
 *   test({ pattern, flags, test }) -> { matches: [...], compileError? }
 */
(function(){
  'use strict';
  if (typeof window === 'undefined') return;
  window.oioxoEngines = window.oioxoEngines || {};
  if (window.oioxoEngines.regex) return;

  function parsePattern(rawQ){
    if (!rawQ || typeof rawQ !== 'string') return null;
    const q = rawQ.trim();
    // Form 1: /pattern/flags string
    let m = q.match(/^\/((?:\\\/|[^\/])+)\/([gimsuy]*)\s+(.+)$/);
    if (m) return { pattern: m[1], flags: m[2] || '', test: stripQuotes(m[3]) };
    // Form 2: regex /pattern/flags (on|test|match|against) string
    m = q.match(/^regex\s+\/((?:\\\/|[^\/])+)\/([gimsuy]*)\s+(?:on|test|match|against)?\s*(.+)$/i);
    if (m) return { pattern: m[1], flags: m[2] || '', test: stripQuotes(m[3]) };
    return null;
  }

  function stripQuotes(s){
    if (!s) return s;
    return s.trim().replace(/^['"](.+)['"]$/, '$1');
  }

  function test(parsed){
    if (!parsed) return null;
    const { pattern, flags, test: subject } = parsed;
    if (!pattern || typeof subject !== 'string') return null;
    if (subject.length > 2000) return null;
    let rx;
    try {
      rx = new RegExp(pattern, flags.includes('g') ? flags : flags + 'g');
    } catch (e) {
      return { compileError: String(e.message || e) };
    }
    const matches = [...subject.matchAll(rx)].map(mm => ({
      match: mm[0],
      index: mm.index,
      groups: mm.length > 1 ? mm.slice(1).map(g => g === undefined ? null : g) : [],
      named: mm.groups ? Object.assign({}, mm.groups) : null,
    }));
    return { matches, subject, pattern, flags };
  }

  window.oioxoEngines.regex = { test, parsePattern };
})();
