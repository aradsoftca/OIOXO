/**
 * Definition card — for "define X", "what does X mean", "X meaning",
 * "X definition", fetch a dictionary card from Wiktionary's free
 * CORS-clean REST API.
 *
 *   https://en.wiktionary.org/api/rest_v1/page/definition/{word}
 *
 * Returns parts of speech + definitions + a pronunciation (IPA when
 * present). No API key. No server. Caches definitions in sessionStorage
 * for the lifetime of the tab.
 *
 * Exposes window.oioxoDefinition = { tryCard, lookup, parsePattern }.
 */
(function(){
  'use strict';
  if (typeof window === 'undefined') return;
  if (window.oioxoDefinition) return;

  const cache = new Map(); // word → { result, ts }
  const CACHE_TTL_MS = 60 * 60 * 1000;

  const PATTERNS = [
    /^define\s+([a-zA-Z][\w-]*)$/i,
    /^what\s+(?:does\s+)?(.+?)\s+mean\??$/i,
    /^what\s+is\s+(?:the\s+meaning\s+of\s+)?([a-zA-Z][\w-]+)\??$/i,
    /^([a-zA-Z][\w-]+)\s+meaning$/i,
    /^([a-zA-Z][\w-]+)\s+definition$/i,
    /^meaning\s+of\s+([a-zA-Z][\w-]+)$/i,
    /^(?:how\s+(?:do\s+you|to))\s+spell\s+([a-zA-Z][\w-]+)\??$/i,
    /^spelling\s+of\s+([a-zA-Z][\w-]+)$/i,
  ];

  /** Pull the word out of a definition-style query, or null. */
  function parsePattern(q){
    if (!q) return null;
    const s = String(q).trim().toLowerCase();
    for (const p of PATTERNS){
      const m = s.match(p);
      if (m && m[1]) return m[1].trim();
    }
    return null;
  }

  async function lookup(word){
    if (!word) return null;
    const key = word.toLowerCase();
    const c = cache.get(key);
    if (c && Date.now() - c.ts < CACHE_TTL_MS) return c.result;
    if (typeof fetch === 'undefined') return null;
    try {
      const url = 'https://en.wiktionary.org/api/rest_v1/page/definition/' + encodeURIComponent(word);
      const r = await Promise.race([
        fetch(url).then((r) => r.json()),
        new Promise((res) => setTimeout(() => res(null), 700)),
      ]);
      if (!r || typeof r !== 'object') return null;
      // English entries live under r.en. Each entry has partOfSpeech + definitions[].
      const entries = Array.isArray(r.en) ? r.en : [];
      if (!entries.length) return null;
      const out = {
        word,
        senses: entries.slice(0, 4).map((e) => ({
          partOfSpeech: e.partOfSpeech,
          definitions: (e.definitions || []).slice(0, 3).map((d) => ({
            text: String(d.definition || '').replace(/<[^>]+>/g, '').trim(),
            examples: (d.examples || []).slice(0, 1).map((x) => String(x).replace(/<[^>]+>/g, '').trim()),
          })).filter((d) => d.text),
        })).filter((s) => s.definitions.length),
      };
      cache.set(key, { result: out, ts: Date.now() });
      return out;
    } catch { return null; }
  }

  /** Returns the intent card for the rewriter to use directly. */
  async function tryCard(query){
    const word = parsePattern(query);
    if (!word) return null;
    const lookup_ = await lookup(word);
    if (!lookup_ || !lookup_.senses.length) return null;
    const first = lookup_.senses[0].definitions[0];
    return {
      kind: 'definition',
      title: word,
      subtitle: lookup_.senses[0].partOfSpeech || '',
      icon: '📖',
      confidence: 0.9,
      formatted: first ? first.text : '',
      senses: lookup_.senses,
      summary: lookup_.senses.length + ' sense' + (lookup_.senses.length === 1 ? '' : 's') + ' from Wiktionary',
      citation: { source: 'wiktionary', url: 'https://en.wiktionary.org/wiki/' + encodeURIComponent(word) },
      inputType: 'none',
    };
  }

  window.oioxoDefinition = { tryCard, lookup, parsePattern };
})();
