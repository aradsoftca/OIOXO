/**
 * QA pattern bias — detects the question type (why / how / when / who /
 * where / what / how-many) and adds a multiplicative bias to sentences
 * that look like they ANSWER that specific question type.
 *
 *   classify(query) → { kind, expectShape }
 *   biasScore(sentence, kind) → multiplier [0.8, 1.5]
 *
 * Used by aianswer.js to re-rank TF-IDF candidates.
 *
 * Exposes window.oioxoQaPattern = { classify, biasScore, biasSentences }.
 */
(function(){
  'use strict';
  if (typeof window === 'undefined') return;
  if (window.oioxoQaPattern) return;

  /** Classify the question by its leading interrogative + verb. */
  function classify(query){
    if (!query) return { kind: 'unknown' };
    const q = String(query).toLowerCase().trim();
    if (/^why\b/.test(q)) return { kind: 'why' };
    if (/^how\s+(?:many|much)\b/.test(q)) return { kind: 'how-many' };
    if (/^how\s+(?:long|old|tall|big|wide|deep|heavy)\b/.test(q)) return { kind: 'measure' };
    if (/^how\b/.test(q)) return { kind: 'how' };
    if (/^when\b/.test(q)) return { kind: 'when' };
    if (/^where\b/.test(q)) return { kind: 'where' };
    if (/^who\b/.test(q)) return { kind: 'who' };
    if (/^what\s+(?:is|are|was|were)\b/.test(q)) return { kind: 'what' };
    if (/^which\b/.test(q)) return { kind: 'which' };
    return { kind: 'unknown' };
  }

  /** Sentence features that indicate an answer. */
  function hasDate(s){
    return /\b(?:19|20)\d{2}\b|\b\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i.test(s);
  }
  function hasNumber(s){
    return /\b\d[\d,]*(?:\.\d+)?\b/.test(s);
  }
  function hasMeasurement(s){
    return /\b\d[\d,]*(?:\.\d+)?\s*(?:km|mi|m|ft|kg|lb|°[CF]|years?|months?|days?|metres?|meters?|miles?|feet|tons?|hours?|minutes?|seconds?)\b/i.test(s);
  }
  function hasCausal(s){
    return /\b(?:because|since|due to|owing to|as a result|therefore|consequently|so that|in order to)\b/i.test(s);
  }
  function hasProperNoun(s){
    return /\b[A-Z][a-z]{2,}(?:\s+[A-Z][a-z]+)*\b/.test(s);
  }
  function hasLocation(s){
    return /\b(?:in|at|near|on|south|north|east|west)\b/i.test(s);
  }

  function biasScore(sentence, kind){
    if (!sentence) return 1;
    const s = String(sentence);
    switch (kind){
      case 'why':       return hasCausal(s) ? 1.5 : 0.9;
      case 'how-many':  return hasNumber(s) ? 1.4 : 0.85;
      case 'measure':   return hasMeasurement(s) ? 1.4 : 0.9;
      case 'how':       return /\b(?:by|through|using|via|with)\b/i.test(s) ? 1.2 : 1;
      case 'when':      return hasDate(s) ? 1.5 : 0.85;
      case 'where':     return hasLocation(s) ? 1.3 : 0.95;
      case 'who':       return hasProperNoun(s) ? 1.3 : 0.9;
      case 'what':      return 1;
      case 'which':     return hasProperNoun(s) ? 1.1 : 1;
      default:          return 1;
    }
  }

  function biasSentences(scoredSentences, kind){
    return scoredSentences.map((x) => Object.assign({}, x, { score: x.score * biasScore(x.sentence, kind) }))
      .sort((a, b) => b.score - a.score);
  }

  window.oioxoQaPattern = { classify, biasScore, biasSentences };
})();
