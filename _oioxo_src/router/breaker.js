/**
 * Circuit breaker — guards expensive optional subsystems (the conductor
 * LLM bridge, the translate skill, the knowledge skills). When a subsystem
 * fails or times out too often, the breaker trips OPEN for a cooldown and
 * callers short-circuit instead of waiting on doomed I/O.
 *
 * States: closed → half-open (probe) → open (skip) → closed.
 *
 *   wrap(name, fn, opts)  — execute fn() with breaker semantics
 *   state(name)           — { state, failures, openedAt, nextProbeAt }
 *   reset(name)           — force-close
 *
 * Exposes window.oioxoBreaker = { wrap, state, reset, allow }.
 */
(function(){
  'use strict';
  if (typeof window === 'undefined') return;
  if (window.oioxoBreaker) return;

  const breakers = new Map(); // name → { state, failures, openedAt, nextProbeAt, threshold, cooldownMs }

  function getOrCreate(name, opts){
    let b = breakers.get(name);
    if (!b){
      b = {
        state: 'closed',
        failures: 0,
        openedAt: 0,
        nextProbeAt: 0,
        threshold: (opts && opts.threshold) || 4,
        cooldownMs: (opts && opts.cooldownMs) || 60000, // 60s default
      };
      breakers.set(name, b);
    }
    return b;
  }

  /** Returns true when the breaker permits a call right now. Side-effect:
   *  transitions open → half-open after the cooldown. */
  function allow(name, opts){
    const b = getOrCreate(name, opts);
    if (b.state === 'closed') return true;
    if (b.state === 'open' && Date.now() >= b.nextProbeAt){
      b.state = 'half-open';
      return true;
    }
    return b.state === 'half-open';
  }

  function onSuccess(name){
    const b = breakers.get(name);
    if (!b) return;
    b.failures = 0;
    b.state = 'closed';
  }

  function onFailure(name){
    const b = breakers.get(name);
    if (!b) return;
    b.failures++;
    if (b.failures >= b.threshold){
      b.state = 'open';
      b.openedAt = Date.now();
      b.nextProbeAt = Date.now() + b.cooldownMs;
    }
  }

  /** Wrap an async fn with breaker semantics. Returns null when the
   *  breaker is open (caller treats null as "skip this subsystem").
   *  Use opts.fallback to return a specific value instead of null. */
  async function wrap(name, fn, opts){
    opts = opts || {};
    if (!allow(name, opts)) return opts.fallback === undefined ? null : opts.fallback;
    try {
      const timeoutMs = opts.timeoutMs;
      const v = timeoutMs
        ? await Promise.race([
            fn(),
            new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), timeoutMs)),
          ])
        : await fn();
      onSuccess(name);
      return v;
    } catch (e) {
      onFailure(name);
      return opts.fallback === undefined ? null : opts.fallback;
    }
  }

  function state(name){
    const b = breakers.get(name);
    if (!b) return { state: 'closed', failures: 0 };
    return Object.assign({}, b);
  }

  function reset(name){
    const b = breakers.get(name);
    if (!b) return;
    b.failures = 0; b.state = 'closed'; b.openedAt = 0; b.nextProbeAt = 0;
  }

  window.oioxoBreaker = { wrap, allow, state, reset };
})();
