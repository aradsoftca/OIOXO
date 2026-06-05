/**
 * Streaming SERP — async-iterator version of serp.process(). Lets the UI
 * render results as each stage completes instead of waiting for the whole
 * pipeline. Useful for slow networks (translate skill mid-flight) or for
 * a "thinking" indicator that progresses through the stages.
 *
 * Yields:
 *   { stage: 'start',          payload: { original } }
 *   { stage: 'rewrite',        payload: { rewritten, corrections, language } }
 *   { stage: 'classify',       payload: { classification } }
 *   { stage: 'translate',      payload: { english, originalLang } } (only when triggered)
 *   { stage: 'compute',        payload: intent | null }
 *   { stage: 'entities',       payload: entities }
 *   { stage: 'resolve',        payload: { intent, plan } }
 *   { stage: 'no-result',      payload: intent } (only when fallback fires)
 *   { stage: 'suggestions',    payload: suggestions }
 *   { stage: 'done',           payload: full envelope }
 *
 * Callers can either:
 *   for await (const chunk of stream(q, cat)) { render(chunk); }
 *   stream(q, cat).consume({ onStage: (s, p) => …, onDone: env => … });
 *
 * Exposes window.oioxoStream = { process }.
 */
(function(){
  'use strict';
  if (typeof window === 'undefined') return;
  if (window.oioxoStream) return;

  function now(){ return typeof performance !== 'undefined' ? performance.now() : Date.now(); }

  /** Returns an object that is BOTH a Promise (resolves to the full
   *  envelope) AND an async iterable (yields per-stage chunks). */
  function process(rawQ, catalog, opts){
    opts = opts || {};
    const context = opts.context || {};
    const queue = [];
    let waiter = null;
    let done = false;
    let finalEnvelope = null;
    let finalError = null;

    function emit(stage, payload){
      const chunk = { stage, payload };
      if (waiter) { const w = waiter; waiter = null; w(chunk); }
      else queue.push(chunk);
    }
    function finish(env, err){
      done = true;
      finalEnvelope = env || null;
      finalError = err || null;
      const chunk = { stage: 'done', payload: env, error: err };
      if (waiter) { const w = waiter; waiter = null; w(chunk); }
      else queue.push(chunk);
    }

    // Drive the pipeline in the background; emit chunks as we go.
    (async () => {
      try {
        emit('start', { original: rawQ });
        const timings = {};

        // 1. Rewrite
        const t0 = now();
        const rewrite = (window.oioxoRewriter && window.oioxoRewriter.rewrite)
          ? window.oioxoRewriter.rewrite(rawQ, catalog)
          : { original: rawQ, rewritten: String(rawQ || '').trim(), language: 'en', corrections: [] };
        timings.rewrite = Math.round(now() - t0);
        let q = rewrite.rewritten;
        emit('rewrite', { rewritten: q, corrections: rewrite.corrections, language: rewrite.language });
        if (!q) {
          finish({ original: rewrite.original, rewritten: '', timings, intent: null, plan: null });
          return;
        }

        // 1b. i18n
        let translation = null;
        if (rewrite.language !== 'en' && window.oioxoI18n && window.oioxoI18n.isAvailable()){
          const tT0 = now();
          const norm = await window.oioxoI18n.normalize(q, rewrite.language);
          timings.translate = Math.round(now() - tT0);
          if (norm.translated){ q = norm.english; translation = norm; }
          emit('translate', { english: q, originalLang: rewrite.language });
        }

        // 1c. Classify (cheap, run before compute so classify can guide).
        const t1 = now();
        const classification = (window.oioxoClassifier && window.oioxoClassifier.classify)
          ? window.oioxoClassifier.classify(q, catalog)
          : { category: 'unknown', confidence: 0 };
        timings.classify = Math.round(now() - t1);
        emit('classify', { classification });

        // 1d. Compute extractor
        let computeAnswer = null;
        if (window.oioxoCompute && typeof window.oioxoCompute.try === 'function'){
          const tC0 = now();
          try { computeAnswer = await window.oioxoCompute.try(q, catalog); } catch {}
          timings.compute = Math.round(now() - tC0);
          emit('compute', computeAnswer);
        }

        // 1e. Entities
        let entities = null;
        if (window.oioxoEntities){
          const tE0 = now();
          try { entities = window.oioxoEntities.extract(q, catalog); } catch {}
          timings.entities = Math.round(now() - tE0);
          emit('entities', entities);
        }

        const ctx = Object.assign({}, context, { classification, language: rewrite.language });

        // 2. Resolve
        let intent = computeAnswer, plan = null;
        const t2 = now();
        if (!intent && window.oioxoRouter){
          if (classification.category === 'multi-step' && typeof window.oioxoRouter.plan === 'function'){
            plan = window.oioxoRouter.plan(q, catalog, { context: ctx });
          }
          if (!plan){
            intent = window.oioxoRouter.resolve(q, catalog, { context: ctx });
          }
          if (!intent && !plan && classification.category !== 'navigation' &&
              classification.category !== 'exploration' && classification.category !== 'meta' &&
              typeof window.oioxoRouter.resolveAsync === 'function' && ctx.useBrain !== false){
            intent = await window.oioxoRouter.resolveAsync(q, catalog, { context: ctx });
          }
        }
        timings.resolve = Math.round(now() - t2);
        emit('resolve', { intent, plan });

        // 2b. No-result fallback
        if (!intent && !plan && classification.category === 'tool' && window.oioxoRouter && window.oioxoRouter.scoreTool){
          const qTokens = window.oioxoRouter.tokenize(q);
          const candidates = catalog.tools
            .map((t) => ({ tool: t, score: window.oioxoRouter.scoreTool(t, qTokens, q.toLowerCase(), ctx) }))
            .filter((c) => c.score > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, 4);
          if (candidates.length){
            intent = {
              kind: 'no-result',
              slug: candidates[0].tool.slug,
              tool: candidates[0].tool,
              confidence: 0.4,
              title: 'Nothing exact — closest tools',
              icon: '🔎',
              inputType: candidates[0].tool.inputType || 'none',
              alternatives: candidates.slice(1).map((c) => ({ slug: c.tool.slug, name: c.tool.name, url: c.tool.url, score: c.score })),
              summary: 'No tool exactly matches; here are the closest.',
            };
            emit('no-result', intent);
          }
        }

        // 3. Memory + history records.
        if (window.oioxoMemory && window.oioxoMemory.record){
          try { window.oioxoMemory.record({ query: q, original: rewrite.original, classification, intent }); } catch {}
        }
        if (intent && intent.tool && window.oioxoHistory && window.oioxoHistory.record){
          try { window.oioxoHistory.record(intent.tool.slug, { source: intent.kind }); } catch {}
        }

        // 4. Suggestions
        const t3 = now();
        let suggestions = [];
        if (window.oioxoSuggest && window.oioxoSuggest.suggest){
          suggestions = window.oioxoSuggest.suggest(rewrite.original, catalog, { limit: 4 });
        }
        timings.suggest = Math.round(now() - t3);
        emit('suggestions', suggestions);

        const envelope = {
          original: rewrite.original, rewritten: q, language: rewrite.language,
          translation, corrections: rewrite.corrections, classification, entities,
          intent, plan, suggestions, timings,
        };
        if (window.oioxoMetrics && window.oioxoMetrics.onEnvelope){
          try { window.oioxoMetrics.onEnvelope(envelope); } catch {}
        }
        finish(envelope);
      } catch (e) {
        finish(null, e);
      }
    })();

    // Async iterator.
    const iterable = {
      [Symbol.asyncIterator](){
        return {
          async next(){
            if (queue.length){
              const chunk = queue.shift();
              if (chunk.stage === 'done') return { value: chunk, done: false }; // emit 'done' once, then terminate
              return { value: chunk, done: false };
            }
            if (done){ return { value: undefined, done: true }; }
            return new Promise((res) => {
              waiter = (chunk) => res({ value: chunk, done: false });
            });
          },
        };
      },
    };

    /** Convenience: run the iterator with callbacks instead of a for-await loop. */
    iterable.consume = function(handlers){
      handlers = handlers || {};
      (async () => {
        for await (const chunk of iterable){
          try {
            handlers.onStage && handlers.onStage(chunk.stage, chunk.payload, chunk.error);
            if (chunk.stage === 'done') { handlers.onDone && handlers.onDone(chunk.payload, chunk.error); break; }
          } catch (e) { handlers.onError && handlers.onError(e); }
        }
      })();
    };

    iterable.envelope = () => finalEnvelope;
    iterable.error = () => finalError;
    return iterable;
  }

  window.oioxoStream = { process };
})();
