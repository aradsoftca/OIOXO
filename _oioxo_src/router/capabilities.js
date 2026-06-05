/**
 * Capabilities surface — answers "what can oioxo do?" and "help" queries
 * with a categorised list of every card type + sample queries. Lets new
 * users discover what to type without having to read docs.
 *
 *   tryCard(query) → { kind: 'capabilities', sections: [...] }
 *   list() → all known capabilities (for /capabilities page)
 *
 * Exposes window.oioxoCapabilities = { tryCard, list, parsePattern }.
 */
(function(){
  'use strict';
  if (typeof window === 'undefined') return;
  if (window.oioxoCapabilities) return;

  const PATTERNS = [
    /^(?:help|what\s+can\s+(?:you|oioxo)\s+do|capabilities|features|tutorial|getting\s+started|how\s+to\s+use)\??$/i,
    /^show\s+me\s+(?:what|everything)\s+you\s+can\s+do$/i,
    /^commands?$/i,
  ];

  const SECTIONS = [
    { title: 'Instant answers', icon: '🧮', items: [
      { sample: 'what is 15% of 200', kind: 'compute' },
      { sample: '100 USD to EUR', kind: 'compute' },
      { sample: '5 miles in km', kind: 'compute' },
      { sample: 'time in tokyo', kind: 'time' },
      { sample: 'world clock', kind: 'world-clock' },
      { sample: 'define jaguar', kind: 'definition' },
      { sample: 'translate hello to french', kind: 'translate' },
      { sample: 'btc price', kind: 'finance' },
      { sample: 'AAPL', kind: 'finance' },
    ] },
    { title: 'Knowledge & reference', icon: '📚', items: [
      { sample: 'who is Albert Einstein', kind: 'fact' },
      { sample: 'what is the Eiffel Tower', kind: 'fact' },
      { sample: 'tell me about Mars', kind: 'fact' },
      { sample: 'latest news', kind: 'news' },
      { sample: 'news about climate', kind: 'news' },
      { sample: 'papers about transformers', kind: 'academic' },
      { sample: 'book on stoicism', kind: 'books' },
    ] },
    { title: 'Media & locations', icon: '🖼', items: [
      { sample: 'images of mountains', kind: 'images' },
      { sample: 'map of Paris', kind: 'map' },
      { sample: 'where is Mount Everest', kind: 'map' },
      { sample: 'recipe for carbonara', kind: 'recipe' },
      { sample: 'lyrics to Bohemian Rhapsody', kind: 'lyrics' },
      { sample: 'Real Madrid score', kind: 'sports' },
      { sample: 'flight BA117', kind: 'flight' },
    ] },
    { title: 'Smart numeric', icon: '🔢', items: [
      { sample: '192.168.1.1', kind: 'numparse' },
      { sample: '#ff6600', kind: 'numparse' },
      { sample: '0xDEADBEEF', kind: 'numparse' },
      { sample: '1995', kind: 'numparse' },
      { sample: '+44 20 1234 5678', kind: 'numparse' },
    ] },
    { title: 'Tools (300+)', icon: '🔧', items: [
      { sample: 'compress pdf', kind: 'tool' },
      { sample: 'mp4 to avi', kind: 'tool' },
      { sample: 'merge audio', kind: 'tool' },
      { sample: 'remove background', kind: 'tool' },
      { sample: 'qr code generator', kind: 'tool' },
    ] },
    { title: 'Search operators', icon: '🎯', items: [
      { sample: 'compress site:wikipedia.org', kind: 'operators' },
      { sample: '"machine learning" filetype:pdf', kind: 'operators' },
      { sample: 'cars -tesla -bmw', kind: 'operators' },
      { sample: 'budget 100..500 phones', kind: 'operators' },
    ] },
    { title: 'Fun', icon: '🎲', items: [
      { sample: 'random trivia', kind: 'trivia' },
      { sample: 'world clock', kind: 'world-clock' },
    ] },
  ];

  function parsePattern(q){
    if (!q) return null;
    const s = String(q).trim();
    for (const p of PATTERNS) if (p.test(s)) return { help: true };
    return null;
  }

  async function tryCard(query){
    const p = parsePattern(query);
    if (!p) return null;
    return {
      kind: 'capabilities',
      title: 'What oioxo can do',
      icon: '✨',
      confidence: 0.95,
      sections: SECTIONS,
      summary: 'Try any of the example queries below.',
      inputType: 'none',
    };
  }

  function list(){ return SECTIONS; }

  window.oioxoCapabilities = { tryCard, parsePattern, list };
})();
