/**
 * Voice → SERP streaming bridge. Glues oioxoVoice.listen() onto
 * oioxoStream.process() so the UI can render BOTH the live transcript
 * AND the SERP stages progressively, instead of waiting for the user to
 * stop speaking.
 *
 * Yields:
 *   { stage: 'listening',  payload: { lang } }
 *   { stage: 'partial',    payload: transcript }       — repeatedly as words come in
 *   { stage: 'transcript', payload: finalTranscript }  — once recognition is final
 *   { stage: 'rewrite' | 'classify' | … }              — passed through from oioxoStream
 *   { stage: 'speak',      payload: phrase }            — only when opts.speak
 *   { stage: 'done',       payload: envelope }
 *
 * Usage:
 *   for await (const ev of oioxoVoiceStream.process(cat, { speak: true })){
 *     render(ev.stage, ev.payload);
 *     if (ev.stage === 'done') break;
 *   }
 *
 * Exposes window.oioxoVoiceStream = { process }.
 */
(function(){
  'use strict';
  if (typeof window === 'undefined') return;
  if (window.oioxoVoiceStream) return;

  function process(catalog, opts){
    opts = opts || {};
    const queue = [];
    let waiter = null;
    let done = false;
    let finalEnvelope = null;

    function emit(stage, payload){
      const chunk = { stage, payload };
      if (waiter) { const w = waiter; waiter = null; w(chunk); }
      else queue.push(chunk);
    }
    function finish(env){
      done = true;
      finalEnvelope = env;
      const chunk = { stage: 'done', payload: env };
      if (waiter) { const w = waiter; waiter = null; w(chunk); }
      else queue.push(chunk);
    }

    (async () => {
      if (!window.oioxoVoice){ finish(null); return; }
      const lang = opts.lang || (typeof navigator !== 'undefined' && navigator.language) || 'en-US';
      emit('listening', { lang });
      const handle = window.oioxoVoice.listen({
        lang,
        interim: true,
        onPartial: (transcript) => emit('partial', transcript),
        onError: (e) => { emit('error', e); finish(null); },
        onFinal: async (transcript) => {
          if (!transcript) { finish(null); return; }
          emit('transcript', transcript);
          if (!window.oioxoStream){
            // Fallback: call SERP directly.
            const env = window.oioxoSerp
              ? await window.oioxoSerp.process(transcript, catalog, { context: { surface: 'voice' } })
              : null;
            if (opts.speak && env && window.oioxoVoice.speak){
              const phrase = pickSpeakPhrase(env);
              if (phrase){ emit('speak', phrase); window.oioxoVoice.speak(phrase, { lang }); }
            }
            finish(env);
            return;
          }
          const stream = window.oioxoStream.process(transcript, catalog, {
            context: Object.assign({}, opts.context || {}, { surface: 'voice' }),
          });
          let env = null;
          for await (const ev of stream){
            // Pass every SERP stage through.
            emit(ev.stage, ev.payload);
            if (ev.stage === 'done'){ env = ev.payload; break; }
          }
          if (opts.speak && env && window.oioxoVoice.speak){
            const phrase = pickSpeakPhrase(env);
            if (phrase){ emit('speak', phrase); window.oioxoVoice.speak(phrase, { lang }); }
          }
          finish(env);
        },
      });
      if (opts.onHandle) opts.onHandle(handle);
    })();

    const iterable = {
      [Symbol.asyncIterator](){
        return {
          async next(){
            if (queue.length){ return { value: queue.shift(), done: false }; }
            if (done){ return { value: undefined, done: true }; }
            return new Promise((res) => { waiter = (chunk) => res({ value: chunk, done: false }); });
          },
        };
      },
    };
    iterable.envelope = () => finalEnvelope;
    return iterable;
  }

  function pickSpeakPhrase(env){
    if (!env) return null;
    if (env.intent){
      if (env.intent.formatted != null) return env.intent.title + ': ' + env.intent.formatted;
      if (env.intent.snippet) return env.intent.snippet;
      if (env.intent.title) return env.intent.title;
    }
    if (env.aiAnswer && env.aiAnswer.answer) return env.aiAnswer.answer.replace(/\[\d+\]/g, '');
    if (env.knowledge && window.oioxoKnowledge && window.oioxoKnowledge.summarize){
      return window.oioxoKnowledge.summarize(env.knowledge);
    }
    return null;
  }

  window.oioxoVoiceStream = { process };
})();
