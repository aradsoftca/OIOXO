/**
 * Explain mode — when context.explain is true, the SERP envelope grows a
 * `debug` panel showing exactly WHY this intent won:
 *
 *   debug: {
 *     candidates: [
 *       { slug, score, signals: { keyword: 3, synonym: 2, history: 1.2, profile: 0.4 } },
 *       …
 *     ],
 *     winningSignals: { … },
 *     timings: { … },
 *     classification: { category, confidence, signals: { … } },
 *   }
 *
 * Surfaced via ?debug=1 URL flag in production. Helps the platform team
 * inspect a confusing rank without firing up the dev tools.
 *
 * Exposes window.oioxoExplain = { build, attach }.
 */
(function(){
  'use strict';
  if (typeof window === 'undefined') return;
  if (window.oioxoExplain) return;

  /** Build a debug panel from candidate signals. The router pushes signals
   *  into a per-resolve trace map; we just format it. */
  function build(envelope, trace){
    if (!envelope) return null;
    return {
      candidates: (trace && trace.candidates) || [],
      winningSignals: (trace && trace.winningSignals) || null,
      classification: envelope.classification,
      timings: envelope.timings,
      cached: envelope.cached || false,
      entities: envelope.entities,
      indexStats: window.oioxoIndex && window.oioxoIndex.stats ? window.oioxoIndex.stats() : null,
      memorySize: window.oioxoMemory && window.oioxoMemory.size ? window.oioxoMemory.size() : null,
      profile: window.oioxoProfile && window.oioxoProfile.snapshot ? window.oioxoProfile.snapshot() : null,
    };
  }

  /** Attach the debug panel to the envelope if `context.explain` is true.
   *  Returns the envelope for chaining. */
  function attach(envelope, trace, context){
    if (!envelope || !context || !context.explain) return envelope;
    envelope.debug = build(envelope, trace);
    return envelope;
  }

  window.oioxoExplain = { build, attach };
})();
