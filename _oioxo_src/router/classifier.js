/**
 * Top-level query classifier — buckets a search query into one of nine
 * coarse intent categories so the SERP orchestrator can dispatch the right
 * providers in the right order with the right context.
 *
 * Categories (in approximate priority order):
 *   tool        — clear single-tool intent (compress pdf, qr code for X)
 *   compute     — deterministic computation (5 miles in km, 100 usd to eur)
 *   conversion  — file-format conversion (mp4 to avi)
 *   app         — open an oioxo app (ai chat, watch party, send a file)
 *   create      — creative / studio task (make a meme)
 *   multi-step  — chain ("transcribe audio then translate")
 *   navigation  — opening a URL / direct site (youtube.com, github trending)
 *   question    — factual question ("what is photosynthesis")
 *   meta        — about oioxo, help, capabilities ("what can you do")
 *   exploration — broad/ambiguous ("best video editors")
 *
 * The classifier is lightweight: pattern + heuristic + catalog signal. It
 * doesn't replace the router's stage-by-stage resolution — it sits ABOVE
 * the router and tells the SERP orchestrator how to spend its time.
 *
 * Exposes window.oioxoClassifier = { classify }.
 */
(function(){
  'use strict';
  if (typeof window === 'undefined') return;
  if (window.oioxoClassifier) return;

  const QUESTION_WORDS = /^(?:what|why|how|when|where|who|whom|whose|which|is|are|can|does|do|did|should|would|will)\b/i;
  const META_PATTERNS = [
    /\boioxo\b.*\b(features|tools|do|can|what)\b/i,
    /\bwhat\s+can\s+(?:you|oioxo)\s+do\b/i,
    /\bhelp\b/i,
    /\babout\s+oioxo\b/i,
    /\bcapabilit/i,
    /\bhow\s+to\s+use\s+oioxo\b/i,
  ];
  const NAV_URL = /^(?:https?:\/\/)?(?:www\.)?[\w-]+\.[a-z]{2,}(?:\/\S*)?$/i;
  const EXPLORATION_HINTS = /\b(?:best|top|popular|recommended|review|comparison|vs\.?|alternatives?)\b/i;
  const CHAIN_SPLITTER = /\s+(?:then|and\s+then|after\s+that|→|->|>>)\s+|[,;]\s+(?=[a-z])/i;
  const COMPUTE_HINTS = [
    /\b\d+(?:\.\d+)?\s*[a-z]{1,5}\s+(?:to|in|=)\s+[a-z]{1,5}\b/i, // 5 miles to km
    /\b\d+\s*(?:\+|-|\*|x|×|\/|÷)\s*\d+\b/i,                       // 2 + 2
    /\b\d{1,4}\s*%\s+of\s+\d/i,                                    // 15% of 200
    /\b(?:sqrt|sin|cos|tan|log)\s*\(/i,
  ];
  const APP_HINTS_BY_SLUG = {
    ai: /\b(?:ai|chat\s+with\s+ai|ask\s+ai)\b/i,
    chat: /\b(?:start|join|host)\s+(?:a\s+)?(?:group\s+)?chat\b/i,
    watch: /\bwatch\s*party\b/i,
    call: /\b(?:video\s*call|p2p\s*call)\b/i,
    send: /\b(?:send\s+(?:a\s+)?file|file\s*send)\b/i,
    clipboard: /\bclipboard\s*sync\b/i,
    note: /\b(?:note|sticky)\b/i,
    board: /\b(?:whiteboard|sticky\s*notes?)\b/i,
    summarize: /\b(?:summari[sz]e|tldr)\b/i,
  };

  function classify(rewritten, catalog){
    const q = (rewritten || '').trim();
    if (!q) return { category: 'unknown', confidence: 0 };

    // 1. multi-step (CHEAP — if the query has chain splitters)
    if (CHAIN_SPLITTER.test(q)) {
      const segs = q.split(CHAIN_SPLITTER).filter(Boolean);
      if (segs.length >= 2) return { category: 'multi-step', confidence: 0.95, segments: segs.length };
    }

    // 2. URL / navigation
    if (NAV_URL.test(q.replace(/\s+/g, ''))) return { category: 'navigation', confidence: 0.95 };

    // 3. App intent
    for (const [slug, rx] of Object.entries(APP_HINTS_BY_SLUG)){
      if (rx.test(q)) return { category: 'app', confidence: 0.92, slug };
    }

    // 4. Conversion (X to Y where both look like extensions)
    const xToY = q.match(/^(?:convert\s+)?([a-z0-9]{2,5})\s*(?:to|→|->|in|into)\s*([a-z0-9]{2,5})\s*(?:converter|file|format)?$/i);
    if (xToY && catalog && catalog.formatGroups){
      const from = xToY[1].toLowerCase(), to = xToY[2].toLowerCase();
      const groups = Object.values(catalog.formatGroups);
      const fromIsExt = groups.some((list) => list.includes(from));
      const toIsExt = groups.some((list) => list.includes(to));
      if (fromIsExt || toIsExt) return { category: 'conversion', confidence: 0.94, from, to };
    }

    // 5. Computation
    for (const rx of COMPUTE_HINTS){
      if (rx.test(q)) return { category: 'compute', confidence: 0.9 };
    }

    // 6. Create / studio — verb form + studio-y noun
    if (/\b(?:make|create|design|build|generate|new)\s+(?:a\s+|an\s+)?(meme|thumbnail|sticker|poster|avatar|invoice|resume|collage|gif|background)\b/i.test(q)){
      return { category: 'create', confidence: 0.9 };
    }

    // 7. Meta / about-oioxo
    for (const rx of META_PATTERNS){
      if (rx.test(q)) return { category: 'meta', confidence: 0.88 };
    }

    // 8. Operation verb on file-shaped target → tool
    if (/\b(compress|merge|split|rotate|resize|extract|remove|trim|crop|reverse|enhance|blur|sharpen|normalize|denoise|amplify|fade|caption|subtitle|transcribe|translate|convert)\s+(?:my\s+|a\s+|the\s+|some\s+)?(?:pdf|image|images|photo|video|audio|sound|music|gif|file)/i.test(q)){
      return { category: 'tool', confidence: 0.9 };
    }

    // 9. Question (starts with WH word OR ended with "?")
    if (QUESTION_WORDS.test(q)) return { category: 'question', confidence: 0.78 };

    // 10. Exploration (best/top/review/comparison etc.)
    if (EXPLORATION_HINTS.test(q)) return { category: 'exploration', confidence: 0.74 };

    // 11. Single-word noun → ambiguous; treat as exploration. Multi-word
    //     bag-of-keywords that match many catalog tools → tool.
    if (catalog && q.split(/\s+/).length >= 2 && window.oioxoRouter && window.oioxoRouter.scoreTool){
      const tokens = q.toLowerCase().split(/\s+/);
      let hits = 0;
      for (const t of (catalog.tools || [])){
        const s = window.oioxoRouter.scoreTool(t, tokens, q.toLowerCase());
        if (s >= 2.0) { hits++; if (hits >= 1) break; }
      }
      if (hits) return { category: 'tool', confidence: 0.72 };
    }

    return { category: 'exploration', confidence: 0.5 };
  }

  window.oioxoClassifier = { classify };
})();
