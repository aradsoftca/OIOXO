/**
 * Chain runner — executes the chain returned by brain-bridge.planTurn().
 * Each step is a small dispatch:
 *
 *   { step: 'search', payload: { query } }          → oioxoSerp.process
 *   { step: 'card:<kind>', payload: { query } }     → tryCard for that module
 *   { step: 'compute', payload: { expr } }          → oioxoCompute.try
 *   { step: 'speak', payload: { text } }            → oioxoVoice.speak
 *   { step: 'open', payload: { url } }              → window.open
 *
 * Returns the final envelope/result of the chain. Steps may produce
 * intermediate state that downstream steps consume.
 *
 * Exposes window.oioxoChainRunner = { run }.
 */
(function(){
  'use strict';
  if (typeof window === 'undefined') return;
  if (window.oioxoChainRunner) return;

  async function run(chain, catalog, opts){
    if (!Array.isArray(chain) || !chain.length) return null;
    opts = opts || {};
    let finalResult = null;
    const trace = [];
    for (const step of chain){
      const s = step && step.step;
      const payload = step && step.payload;
      if (!s) continue;
      try {
        if (s === 'search' && window.oioxoSerp){
          finalResult = await window.oioxoSerp.process(payload.query, catalog, opts);
        } else if (s.startsWith('card:')){
          const kind = s.slice(5);
          const mod = ({
            time: 'oioxoTimecard', news: 'oioxoNews', finance: 'oioxoFinance',
            translate: 'oioxoTranslateCard', define: 'oioxoDefinition',
            fact: 'oioxoFactcard', map: 'oioxoMapcard', image: 'oioxoImagecard',
            book: 'oioxoBookcard', academic: 'oioxoAcademiccard', recipe: 'oioxoRecipecard',
            lyrics: 'oioxoLyricscard', sport: 'oioxoSportscard', flight: 'oioxoFlightcard',
            trivia: 'oioxoTriviacard', stack: 'oioxoStackcard', hn: 'oioxoHncard',
            tv: 'oioxoTvcard', food: 'oioxoFoodcard', isbn: 'oioxoIsbncard',
            doi: 'oioxoDoicard', apod: 'oioxoApodcard', wayback: 'oioxoWaybackcard',
          })[kind];
          if (mod && window[mod] && window[mod].tryCard){
            finalResult = await window[mod].tryCard(payload.query);
          }
        } else if (s === 'compute' && window.oioxoCompute){
          finalResult = await window.oioxoCompute.try(payload.expr || payload.query);
        } else if (s === 'speak' && window.oioxoVoice && window.oioxoVoice.speak){
          window.oioxoVoice.speak(payload.text);
        } else if (s === 'open' && typeof window.open === 'function'){
          window.open(payload.url, '_blank', 'noopener,noreferrer');
        }
        trace.push({ step: s, ok: true });
      } catch (e) {
        trace.push({ step: s, ok: false, error: String(e && e.message || e) });
      }
    }
    return { result: finalResult, trace };
  }

  window.oioxoChainRunner = { run };
})();
