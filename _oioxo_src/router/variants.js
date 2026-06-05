/**
 * Variant registry + A/B dispatcher — lets the platform team ship more than
 * one resolver implementation in production and route traffic between them
 * via a `context.variant` flag.
 *
 * Use cases:
 *   - A/B test a new ranking algorithm against the live one
 *   - Quarantine an experimental brain integration to opt-in users
 *   - Roll out language-specific resolvers gradually
 *
 * Two flavors:
 *   register(name, { resolve, score, classify, scoreBoost })
 *     — fully replace one or more router fns for callers tagged with that
 *       variant. The base implementations stay live for unflagged calls.
 *   bucket(userKey, variants, weights?)
 *     — deterministic bucket assignment from a stable user key (e.g. the
 *       device id from oioxoLoader.deviceId()) using a fast string hash.
 *       Returns the variant name that user should land in. Weights default
 *       to equal split.
 *
 * Exposes window.oioxoVariants = { register, unregister, list, dispatch,
 *                                   bucket, current }.
 */
(function(){
  'use strict';
  if (typeof window === 'undefined') return;
  if (window.oioxoVariants) return;

  const variants = new Map();

  /** Register an alternate resolver. fns may contain any subset of
   *  { resolve, classify, score, scoreBoost }. The base implementation
   *  applies for anything not provided. */
  function register(name, fns){
    if (!name || typeof name !== 'string' || !fns) return;
    variants.set(name, fns);
  }

  function unregister(name){ variants.delete(name); }

  function list(){ return Array.from(variants.keys()); }

  /** Look up the resolver function for a variant. Returns null when the
   *  variant isn't registered (caller falls back to base). */
  function dispatch(name, fn){
    if (!name) return null;
    const v = variants.get(name);
    if (!v) return null;
    return v[fn] || null;
  }

  /** Deterministic 32-bit FNV-1a hash. Stable across runs given the same
   *  input — perfect for sticky variant assignment. */
  function hash32(str){
    let h = 2166136261;
    for (let i = 0; i < str.length; i++){
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  /** Bucket a user into one of `variants` by stable hash. Weights are
   *  proportional (e.g. [3,1] = 75/25). Default = equal split. */
  function bucket(userKey, variantsList, weights){
    if (!Array.isArray(variantsList) || !variantsList.length) return null;
    const w = weights || variantsList.map(() => 1);
    const total = w.reduce((s, x) => s + x, 0);
    const point = hash32(String(userKey || 'anon')) % total;
    let acc = 0;
    for (let i = 0; i < variantsList.length; i++){
      acc += w[i];
      if (point < acc) return variantsList[i];
    }
    return variantsList[variantsList.length - 1];
  }

  /** Read the variant the current resolveContext is using. Used by
   *  metrics.js to attribute aggregated counts to variants for CTR
   *  comparison. */
  function current(context){
    if (!context) return null;
    if (context.variant && variants.has(context.variant)) return context.variant;
    return null;
  }

  window.oioxoVariants = { register, unregister, list, dispatch, bucket, current, hash32 };
})();
