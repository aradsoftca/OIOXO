/**
 * Conversational memory — last N queries (with their classifications) in
 * sessionStorage so multi-turn flows know the prior context.
 *
 * Search context shouldn't persist forever (different sessions = different
 * intents) so we use sessionStorage, not localStorage. The persistent
 * history-of-used-tools lives in oioxo/router/history.js, which IS
 * localStorage-backed and survives across sessions.
 *
 * Exposes window.oioxoMemory = { record, recent, lastIntent, lastTool,
 *                                topicHint, clear }.
 */
(function(){
  'use strict';
  if (typeof window === 'undefined') return;
  if (window.oioxoMemory) return;

  const KEY = 'oioxo.router.memory.v1';
  const LIMIT = 10;
  const TOPIC_MIN_CONFIDENCE = 0.7;

  function read(){
    try {
      if (typeof sessionStorage === 'undefined') return [];
      const raw = sessionStorage.getItem(KEY);
      if (!raw) return [];
      const j = JSON.parse(raw);
      return Array.isArray(j) ? j : [];
    } catch { return []; }
  }
  function write(list){
    try { if (typeof sessionStorage !== 'undefined') sessionStorage.setItem(KEY, JSON.stringify(list)); } catch {}
  }

  /** Record a query → its classification + winning intent. The full
   *  classification block helps future turns understand "what about
   *  tomorrow?" — they can read the last topic. */
  function record(entry){
    if (!entry || !entry.query) return;
    const list = read();
    list.unshift({
      query: entry.query,
      original: entry.original || entry.query,
      classification: entry.classification || null,
      intent: entry.intent ? {
        kind: entry.intent.kind,
        slug: entry.intent.slug,
        url: entry.intent.tool && entry.intent.tool.url,
        confidence: entry.intent.confidence,
      } : null,
      ts: Date.now(),
    });
    while (list.length > LIMIT) list.pop();
    write(list);
  }

  function recent(n){
    n = Math.max(1, Math.min(LIMIT, n || 5));
    return read().slice(0, n);
  }

  function lastIntent(){
    const list = read();
    for (const e of list){ if (e.intent && e.intent.slug) return e.intent; }
    return null;
  }

  function lastTool(){
    const i = lastIntent();
    return i ? i.slug : null;
  }

  /** Pull a topic hint from the most recent confident classification —
   *  useful for follow-up queries like "what about tomorrow?" that need
   *  to know the prior turn was about weather. Returns the category +
   *  any extracted params, or null. */
  function topicHint(){
    const list = read();
    for (const e of list){
      const c = e.classification;
      if (!c || typeof c.confidence !== 'number') continue;
      if (c.confidence < TOPIC_MIN_CONFIDENCE) continue;
      return { category: c.category, slug: c.slug, from: c.from, to: c.to, ts: e.ts };
    }
    return null;
  }

  function clear(){
    try { if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem(KEY); } catch {}
  }

  window.oioxoMemory = { record, recent, lastIntent, lastTool, topicHint, clear };
})();
