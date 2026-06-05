/**
 * Snippet generator — turns a generic tool/intent into a per-query preview
 * line, using the extracted entities so the user sees a concrete preview.
 *
 *   intent: tool "compress-pdf"     query "compress 5 pdf files"
 *     → "Compress 5 PDF files in your browser. Free up to 1 file, sign up for more."
 *
 *   intent: conversion "mp4 to avi"  query "convert birthday.mp4 to avi"
 *     → "Convert birthday.mp4 → AVI. Stays on your device."
 *
 *   intent: compute-math 22         query "15 + 7"
 *     → "= 22"
 *
 *   intent: knowledge weather       subject Tokyo
 *     → "Live weather + air quality for Tokyo."
 *
 * Exposes window.oioxoSnippets = { forEnvelope, forIntent }.
 */
(function(){
  'use strict';
  if (typeof window === 'undefined') return;
  if (window.oioxoSnippets) return;

  function first(arr){ return Array.isArray(arr) && arr.length ? arr[0] : null; }

  /** Build a preview snippet for a single intent + its parent envelope. */
  function forIntent(intent, envelope){
    if (!intent) return '';
    const entities = envelope && envelope.entities;
    const qty = entities && first(entities.quantities);
    const exts = entities && entities.extensions || [];
    const subject = (envelope && envelope.knowledge && envelope.knowledge.subject) || null;

    if (intent.kind === 'compute-math'){
      return '= ' + (intent.formatted != null ? intent.formatted : intent.result);
    }
    if (intent.kind === 'compute-units' || intent.kind === 'compute-currency' || intent.kind === 'compute-date'){
      return intent.formatted || ('= ' + intent.result);
    }
    if (intent.kind === 'conversion' || intent.kind === 'conversion-fallback'){
      const from = exts[0] && exts[0].value;
      const to = exts[1] && exts[1].value;
      if (from && to) return 'Convert ' + from.toUpperCase() + ' → ' + to.toUpperCase() + '. Stays on your device.';
      return (intent.tool && intent.tool.name) || 'Converter';
    }
    if (intent.kind === 'operation'){
      const verb = intent.tool && intent.tool.name ? intent.tool.name : 'Run';
      if (qty) return verb + ' (' + qty.value + ' files). Runs in your browser.';
      return verb + '. Runs in your browser.';
    }
    if (intent.kind === 'app'){
      return (intent.tool && intent.tool.summary) || (intent.tool && intent.tool.name) || 'Open app';
    }
    if (intent.kind === 'studio'){
      return (intent.tool && intent.tool.summary) || (intent.tool && intent.tool.name) || 'Open studio';
    }
    if (intent.kind === 'knowledge'){
      return subject ? ('Live answer for ' + subject.value + '.') : 'Live answer.';
    }
    if (intent.kind === 'no-result'){
      return 'No exact match — here are the closest tools.';
    }
    return (intent.tool && intent.tool.summary) || intent.title || '';
  }

  /** Add a `snippet` field to the envelope's intent + each alternative. */
  function forEnvelope(envelope){
    if (!envelope) return envelope;
    if (envelope.intent){
      envelope.intent.snippet = forIntent(envelope.intent, envelope);
      if (Array.isArray(envelope.intent.alternatives)){
        envelope.intent.alternatives.forEach((a) => {
          a.snippet = forIntent({ kind: 'operation', tool: a }, envelope);
        });
      }
    }
    if (envelope.plan && envelope.plan.steps){
      envelope.plan.steps.forEach((s) => { s.snippet = forIntent(s, envelope); });
    }
    return envelope;
  }

  window.oioxoSnippets = { forEnvelope, forIntent };
})();
