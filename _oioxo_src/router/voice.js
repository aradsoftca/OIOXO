/**
 * Voice surface — wraps the Web Speech API and gives the router two new
 * entry points:
 *
 *   listen({ onPartial, onFinal, onError, lang })   — start speech recognition
 *   speak(text, opts)                                — read text back via TTS
 *   processVoice(catalog, opts)                      — one-shot listen → SERP → speak
 *
 * The router auto-sets `context.surface = 'voice'` when invoked through
 * processVoice() so the card renderer can adapt (e.g. swap "Open full tool"
 * to "Tap to open"). Failures degrade gracefully — speech APIs are absent
 * in some browsers (Firefox, older Safari) and we no-op instead of crash.
 *
 * Exposes window.oioxoVoice = { listen, stop, speak, cancelSpeech,
 *                                processVoice, isAvailable }.
 */
(function(){
  'use strict';
  if (typeof window === 'undefined') return;
  if (window.oioxoVoice) return;

  const SR = window.SpeechRecognition || window.webkitSpeechRecognition || null;
  const synth = (typeof window.speechSynthesis !== 'undefined') ? window.speechSynthesis : null;

  function isAvailable(){
    return { recognition: !!SR, synthesis: !!synth };
  }

  /** State of the current recognition session. Only one at a time — calling
   *  listen() again stops the previous session. */
  let current = null;

  /** Start listening. Returns a handle with .stop() so the caller can cancel
   *  cleanly. Auto-detects locale from navigator.language unless lang is
   *  provided. interim:true streams partial transcripts via onPartial. */
  function listen(opts){
    opts = opts || {};
    if (!SR) {
      opts.onError && opts.onError(new Error('speech-recognition-unavailable'));
      return { stop(){} };
    }
    if (current) { try { current.stop(); } catch {} current = null; }
    const r = new SR();
    r.lang = opts.lang || (typeof navigator !== 'undefined' && navigator.language) || 'en-US';
    r.interimResults = opts.interim !== false;
    r.continuous = !!opts.continuous;
    r.maxAlternatives = opts.alternatives || 1;
    let buffer = '';
    r.onresult = (e) => {
      let text = '';
      let isFinal = false;
      for (let i = e.resultIndex; i < e.results.length; i++){
        const res = e.results[i];
        text += res[0].transcript;
        if (res.isFinal) isFinal = true;
      }
      buffer = (buffer + ' ' + text).trim().replace(/\s+/g, ' ');
      if (isFinal) {
        opts.onFinal && opts.onFinal(buffer);
        if (!r.continuous) {
          try { r.stop(); } catch {}
          current = null;
        }
      } else if (opts.onPartial) {
        opts.onPartial(buffer);
      }
    };
    r.onerror = (e) => {
      opts.onError && opts.onError(e.error ? new Error(String(e.error)) : e);
    };
    r.onend = () => {
      if (current === r) current = null;
      opts.onEnd && opts.onEnd(buffer);
    };
    try { r.start(); current = r; }
    catch (e) { opts.onError && opts.onError(e); }
    return {
      stop(){ try { r.stop(); } catch {} current = null; },
      abort(){ try { r.abort(); } catch {} current = null; },
    };
  }

  function stop(){
    if (!current) return;
    try { current.stop(); } catch {}
    current = null;
  }

  /** Speak text via SpeechSynthesisUtterance. Picks a language-matched voice
   *  when available; otherwise defaults. Returns a handle with .cancel(). */
  function speak(text, opts){
    if (!synth || !text) return { cancel(){} };
    opts = opts || {};
    try { synth.cancel(); } catch {}
    const u = new SpeechSynthesisUtterance(String(text));
    u.lang = opts.lang || (typeof navigator !== 'undefined' && navigator.language) || 'en-US';
    u.rate = typeof opts.rate === 'number' ? opts.rate : 1.0;
    u.pitch = typeof opts.pitch === 'number' ? opts.pitch : 1.0;
    u.volume = typeof opts.volume === 'number' ? opts.volume : 1.0;
    try {
      const voices = synth.getVoices();
      const match = voices.find((v) => v.lang === u.lang) ||
                    voices.find((v) => v.lang.split('-')[0] === u.lang.split('-')[0]);
      if (match) u.voice = match;
    } catch {}
    u.onend = () => opts.onEnd && opts.onEnd();
    u.onerror = (e) => opts.onError && opts.onError(e);
    synth.speak(u);
    return { cancel(){ try { synth.cancel(); } catch {} } };
  }

  function cancelSpeech(){ try { synth && synth.cancel(); } catch {} }

  /** One-shot voice → SERP pipeline. Returns a promise that resolves with
   *  the SERP envelope once the user has finished speaking. The orchestrator
   *  is invoked with context.surface = 'voice' so the card renderer can
   *  switch to voice-friendly CTAs (Open in voice mode, speak-back, etc.). */
  function processVoice(catalog, opts){
    opts = opts || {};
    return new Promise((resolve, reject) => {
      const h = listen({
        lang: opts.lang,
        onPartial: opts.onPartial,
        onFinal: async (transcript) => {
          if (!transcript) { resolve(null); return; }
          opts.onTranscript && opts.onTranscript(transcript);
          if (!window.oioxoSerp || typeof window.oioxoSerp.process !== 'function'){
            resolve({ original: transcript, rewritten: transcript, intent: null });
            return;
          }
          const ctx = Object.assign({}, opts.context || {}, { surface: 'voice' });
          const env = await window.oioxoSerp.process(transcript, catalog, { context: ctx });
          // Speak the intent title or compute result if speak:true.
          if (opts.speak && env){
            const phrase = env.intent && (env.intent.formatted != null
              ? (env.intent.title + ': ' + env.intent.formatted)
              : env.intent.title)
              || (env.plan ? env.plan.title : null)
              || 'No result found.';
            speak(phrase, { lang: opts.lang });
          }
          resolve(env);
        },
        onError: (e) => reject(e),
      });
      if (opts.onHandle) opts.onHandle(h);
    });
  }

  window.oioxoVoice = { listen, stop, speak, cancelSpeech, processVoice, isAvailable };
})();
