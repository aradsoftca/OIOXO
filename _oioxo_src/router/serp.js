/**
 * SERP orchestrator — the top-level coordinator that chains every router
 * sub-module into a single search pipeline. Used by iaRouter (the unified
 * search.html provider) and any external caller that wants a structured
 * search result envelope instead of just an intent.
 *
 * Pipeline:
 *   1. Rewriter   — normalize the raw query
 *   2. Classifier — bucket into a coarse intent category
 *   3. Memory     — record this turn for future multi-turn awareness
 *   4. Router     — resolve a specific tool/app/conversion/operation intent
 *      4a. Planner   — if classifier said "multi-step", call planner
 *      4b. resolveAsync — escalate to brain when sync stages all return null
 *   5. History    — record the chosen tool slug for next-time recency boost
 *
 * Returns:
 *   {
 *     original, rewritten, language, corrections, classification,
 *     intent | plan,        // whichever the pipeline produced (may be null)
 *     suggestions,          // related queries based on the classification
 *     timings,              // per-stage durationMs
 *   }
 *
 * Exposes window.oioxoSerp = { process }.
 */
(function(){
  'use strict';
  if (typeof window === 'undefined') return;
  if (window.oioxoSerp) return;

  function now(){ return typeof performance !== 'undefined' ? performance.now() : Date.now(); }

  // SERP envelope cache — keyed by (catalog.version, normalized query, tier).
  // 5-minute TTL so a back-forward navigation doesn't re-run the entire
  // pipeline. Memoization at the router-stage level only covers the resolve
  // step; this caches the full envelope (rewrite + classify + intent +
  // suggestions + corrections).
  const CACHE_LIMIT = 30;
  const CACHE_TTL_MS = 5 * 60 * 1000;
  const cache = new Map();
  function cacheKey(rawQ, catalog, context){
    const tier = (context && context.tier) || '';
    const surface = (context && context.surface) || '';
    const variant = (context && context.variant) || '';
    return (catalog && catalog.version != null ? catalog.version : 'v?') +
      ':' + (rawQ || '').trim().toLowerCase().replace(/\s+/g, ' ') +
      '|' + tier + '|' + surface + '|' + variant;
  }
  function cacheGet(key){
    const e = cache.get(key);
    if (!e) return undefined;
    if (Date.now() - e.ts > CACHE_TTL_MS) { cache.delete(key); return undefined; }
    cache.delete(key); cache.set(key, e); // LRU refresh
    return e.envelope;
  }
  function cacheSet(key, envelope){
    if (cache.has(key)) cache.delete(key);
    cache.set(key, { envelope, ts: Date.now() });
    while (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value);
  }

  async function process(rawQ, catalog, opts){
    opts = opts || {};
    const timings = {};
    const context = opts.context || {};
    // 0. Envelope cache — skip when debug or explicitly disabled. A cache
    //    hit still records the turn to memory/history because each issued
    //    query is a user-meaningful event; only the heavy resolve work is
    //    skipped.
    if (!opts.noCache){
      const k = cacheKey(rawQ, catalog, context);
      const hit = cacheGet(k);
      if (hit){
        if (window.oioxoMemory && window.oioxoMemory.record){
          try {
            window.oioxoMemory.record({
              query: hit.rewritten || rawQ,
              original: hit.original || rawQ,
              classification: hit.classification,
              intent: hit.intent,
            });
          } catch {}
        }
        if (window.oioxoMetrics && typeof window.oioxoMetrics.onEnvelope === 'function'){
          try { window.oioxoMetrics.onEnvelope(hit); } catch {}
        }
        return Object.assign({}, hit, { cached: true });
      }
    }

    // 1. Rewrite
    const t0 = now();
    const rewrite = (window.oioxoRewriter && window.oioxoRewriter.rewrite)
      ? window.oioxoRewriter.rewrite(rawQ, catalog)
      : { original: rawQ, rewritten: String(rawQ || '').trim(), language: 'en', corrections: [] };
    timings.rewrite = Math.round(now() - t0);
    let q = rewrite.rewritten;
    if (!q) return { original: rewrite.original, rewritten: '', language: rewrite.language, corrections: [], classification: null, intent: null, plan: null, suggestions: [], timings };

    // 1a. Conversational follow-up — if the current query is short and the
    //     prior turn had context, expand. Skip when the query already
    //     matches a card pattern (definition, time, news, finance,
    //     translate) — those launch a brand-new intent.
    let followupExpansion = null;
    if (window.oioxoFollowup && window.oioxoMemory && window.oioxoMemory.recent){
      const cardParsers = [
        window.oioxoNumparse && window.oioxoNumparse.classify,
        window.oioxoIsbncard && window.oioxoIsbncard.parsePattern,
        window.oioxoDoicard && window.oioxoDoicard.parsePattern,
        window.oioxoDefinition && window.oioxoDefinition.parsePattern,
        window.oioxoTimecard && window.oioxoTimecard.parsePattern,
        window.oioxoTranslateCard && window.oioxoTranslateCard.parsePattern,
        window.oioxoFinance && window.oioxoFinance.parsePattern,
        window.oioxoMapcard && window.oioxoMapcard.parsePattern,
        window.oioxoFlightcard && window.oioxoFlightcard.parsePattern,
        window.oioxoImagecard && window.oioxoImagecard.parsePattern,
        window.oioxoLyricscard && window.oioxoLyricscard.parsePattern,
        window.oioxoRecipecard && window.oioxoRecipecard.parsePattern,
        window.oioxoSportscard && window.oioxoSportscard.parsePattern,
        window.oioxoBookcard && window.oioxoBookcard.parsePattern,
        window.oioxoAcademiccard && window.oioxoAcademiccard.parsePattern,
        window.oioxoStackcard && window.oioxoStackcard.parsePattern,
        window.oioxoHncard && window.oioxoHncard.parsePattern,
        window.oioxoTvcard && window.oioxoTvcard.parsePattern,
        window.oioxoFoodcard && window.oioxoFoodcard.parsePattern,
        window.oioxoApodcard && window.oioxoApodcard.parsePattern,
        window.oioxoWaybackcard && window.oioxoWaybackcard.parsePattern,
        window.oioxoMultihop && window.oioxoMultihop.parsePattern,
        window.oioxoTriviacard && window.oioxoTriviacard.parsePattern,
        window.oioxoCapabilities && window.oioxoCapabilities.parsePattern,
        window.oioxoFactcard && window.oioxoFactcard.parsePattern,
        window.oioxoNews && window.oioxoNews.parsePattern,
      ];
      const looksLikeCard = cardParsers.some((fn) => fn && fn(q));
      if (!looksLikeCard){
        const prior = window.oioxoMemory.recent(1)[0];
        if (prior && prior.query && prior.query !== q){
          const expanded = window.oioxoFollowup.expand(q, prior.query);
          if (expanded && expanded !== q){
            followupExpansion = { from: q, to: expanded, priorQuery: prior.query };
            q = expanded;
          }
        }
      }
    }

    // 1b. Multilingual normalization — when language is non-English AND the
    //     translate skill is loaded, swap the query through translate so the
    //     downstream regex/keyword stages (English-shaped) still match. The
    //     envelope carries translated:{from,original} for UI display.
    let translation = null;
    if (rewrite.language !== 'en' && window.oioxoI18n && window.oioxoI18n.isAvailable()){
      const tT0 = now();
      const norm = await window.oioxoI18n.normalize(q, rewrite.language);
      timings.translate = Math.round(now() - tT0);
      if (norm.translated){ q = norm.english; translation = norm; }
    }

    // 1b-bis. Operator parsing — pull out site:/filetype:/"phrase"/-exclude
    //         BEFORE the catalog resolver sees the query. Cleaned query
    //         drives normal scoring; operators target the web/federation.
    let operators = null;
    if (window.oioxoOperators && typeof window.oioxoOperators.parse === 'function'){
      const parsed = window.oioxoOperators.parse(q);
      if (parsed && window.oioxoOperators.hasAny(parsed.operators)){
        operators = parsed.operators;
        if (parsed.cleanQuery) q = parsed.cleanQuery;
      }
    }

    // 1c. Compute extractor — for instant-answer queries (math, unit conv,
    //     currency conv, date math) return a card directly without going
    //     through the catalog. The "compute" classification stays for
    //     metrics + card branding.
    let computeAnswer = null;
    if (window.oioxoCompute && typeof window.oioxoCompute.try === 'function'){
      const tC0 = now();
      try { computeAnswer = await window.oioxoCompute.try(q, catalog); } catch {}
      timings.compute = Math.round(now() - tC0);
    }

    // 1c-bis. Instant-answer cards in priority order (cheap parse-and-skip
    //         pattern, so a non-match is sub-millisecond). The first card
    //         that returns wins; computeAnswer takes precedence.
    let cardAnswer = null;
    if (!computeAnswer){
      const cardModules = [
        window.oioxoCapabilities,  // "help" / "what can oioxo do"
        window.oioxoMultihop,      // "compare X and Y" — runs early so it pre-empts factcard
        window.oioxoNumparse,      // numeric identity (year, IP, hex colour…)
        window.oioxoIsbncard,      // bare ISBN
        window.oioxoDoicard,       // bare DOI
        window.oioxoTimecard,
        window.oioxoDefinition,
        window.oioxoTranslateCard,
        window.oioxoFinance,
        window.oioxoMapcard,       // "map of X" / "where is X"
        window.oioxoFlightcard,    // "flight BA123"
        window.oioxoImagecard,     // "images of X"
        window.oioxoLyricscard,    // "lyrics X"
        window.oioxoRecipecard,    // "recipe for X"
        window.oioxoSportscard,    // "X score"
        window.oioxoBookcard,      // "book about X"
        window.oioxoAcademiccard,  // "papers on X"
        window.oioxoStackcard,     // "stack X" / "X stackoverflow"
        window.oioxoHncard,        // "hn X"
        window.oioxoTvcard,        // "X tv show"
        window.oioxoFoodcard,      // "ingredients in X" / barcode
        window.oioxoApodcard,      // "astronomy picture today"
        window.oioxoWaybackcard,   // "old version of X"
        window.oioxoTriviacard,    // "random trivia"
        window.oioxoFactcard,      // "who is X" / "what is X" — runs LATE so specific cards win
        window.oioxoNews,
      ];
      for (const mod of cardModules){
        if (!mod || typeof mod.tryCard !== 'function') continue;
        try {
          const card = await mod.tryCard(q, catalog);
          if (card){ cardAnswer = card; break; }
        } catch {}
      }
    }

    // 1d. Entity extraction — exposed in the envelope for downstream + UI.
    let entities = null;
    if (window.oioxoEntities && typeof window.oioxoEntities.extract === 'function'){
      const tE0 = now();
      try { entities = window.oioxoEntities.extract(q, catalog); } catch {}
      timings.entities = Math.round(now() - tE0);
    }

    // 2. Classify
    const t1 = now();
    const classification = (window.oioxoClassifier && window.oioxoClassifier.classify)
      ? window.oioxoClassifier.classify(q, catalog)
      : { category: 'unknown', confidence: 0 };
    timings.classify = Math.round(now() - t1);

    // Annotate context with the classification + memory for downstream.
    const ctx = Object.assign({}, context, {
      classification,
      language: rewrite.language,
      lastTopic: window.oioxoMemory && window.oioxoMemory.topicHint && window.oioxoMemory.topicHint(),
    });

    // 3. Resolve — compute answer wins if present; otherwise instant-answer
    //    card; otherwise router-classified intent.
    let intent = null, plan = null;
    const t2 = now();
    if (computeAnswer){
      intent = computeAnswer;
    } else if (cardAnswer){
      intent = cardAnswer;
    } else if (window.oioxoRouter){
      if (classification.category === 'multi-step' && typeof window.oioxoRouter.plan === 'function'){
        plan = window.oioxoRouter.plan(q, catalog, { context: ctx });
      }
      if (!plan){
        intent = window.oioxoRouter.resolve(q, catalog, { context: ctx });
      }
      // Brain escalation when sync stages returned nothing AND classification
      // suggests a tool-shaped question. Skip for pure exploration / nav.
      if (!intent && !plan && classification.category !== 'navigation' &&
          classification.category !== 'exploration' && classification.category !== 'meta' &&
          typeof window.oioxoRouter.resolveAsync === 'function' && ctx.useBrain !== false){
        intent = await window.oioxoRouter.resolveAsync(q, catalog, { context: ctx });
      }
    }
    timings.resolve = Math.round(now() - t2);

    // 3b. No-result fallback — when the query looked tool-shaped OR was a
    //     question with possible tool keywords AND nothing matched, build
    //     a "closest-tools" intent from the catalog keyword scorer. Skip
    //     for pure navigation / meta / exploration where other providers
    //     handle it.
    // Fire whenever no other resolver landed an intent. Better to surface
    // a "closest tools" hint than blank-out — even for navigation /
    // exploration / meta queries the user may want a related tool.
    if (!intent && !plan && window.oioxoRouter && window.oioxoRouter.scoreTool){
      const qTokens = window.oioxoRouter.tokenize ? window.oioxoRouter.tokenize(q) : q.toLowerCase().split(/\s+/);
      const qLower = q.toLowerCase();
      const candidates = [];
      for (const t of catalog.tools){
        const s = window.oioxoRouter.scoreTool(t, qTokens, qLower, ctx);
        if (s > 0) candidates.push({ tool: t, score: s });
      }
      candidates.sort((a, b) => b.score - a.score);
      const top = candidates.slice(0, 4);
      if (top.length){
        intent = {
          kind: 'no-result',
          slug: top[0].tool.slug,
          tool: top[0].tool,
          confidence: Math.max(0.3, Math.min(0.6, top[0].score / 8)),
          title: 'Nothing exact — closest tools',
          icon: '🔎',
          inputType: top[0].tool.inputType || 'none',
          alternatives: top.slice(1).map((c) => ({ slug: c.tool.slug, name: c.tool.name, url: c.tool.url, score: c.score })),
          summary: 'No tool exactly matches your query, but these are the closest matches we found.',
        };
      } else if (qTokens.length >= 1){
        // No catalog candidates at all — fall back to a "search" intent
        // that points the user at the federated web results block. Better
        // than a blank SERP for cases like "excel to csv", "GLB to GLTF",
        // "youtube downloader" where no catalog tool matches but the web
        // does have answers.
        intent = {
          kind: 'search',
          slug: null,
          tool: null,
          confidence: 0.3,
          title: 'No tool — see web results below',
          icon: '🔎',
          inputType: 'none',
          summary: 'No tool matched. The web results below may help.',
        };
      }
    }

    // 4. Record turn + tool use.
    if (window.oioxoMemory && window.oioxoMemory.record){
      try {
        window.oioxoMemory.record({
          query: q,
          original: rewrite.original,
          classification,
          intent,
        });
      } catch {}
    }
    if (intent && intent.tool && window.oioxoHistory && window.oioxoHistory.record){
      try { window.oioxoHistory.record(intent.tool.slug, { source: intent.kind }); } catch {}
    }
    if (plan && plan.steps && plan.steps[0] && plan.steps[0].tool && window.oioxoHistory && window.oioxoHistory.record){
      try { window.oioxoHistory.record(plan.steps[0].tool.slug, { source: 'plan' }); } catch {}
    }

    // 5. Suggestions — related queries based on the classification.
    const t3 = now();
    let suggestions = [];
    if (window.oioxoSuggest && window.oioxoSuggest.suggest){
      // Suggest completions of the user's typed query, not the rewritten one.
      suggestions = window.oioxoSuggest.suggest(rewrite.original, catalog, { limit: 4 });
    }
    timings.suggest = Math.round(now() - t3);

    // 6. Knowledge enrichment — entity-driven side panels via existing
    //    weather/country/astro/pageviews skills. 1.2s wall-clock cap inside
    //    knowledge.enrich() means this never blocks the SERP.
    let knowledge = null;
    if (window.oioxoKnowledge && typeof window.oioxoKnowledge.enrich === 'function'){
      const tK0 = now();
      try {
        knowledge = await window.oioxoKnowledge.enrich(
          { rewritten: q, original: rewrite.original, entities },
          catalog,
        );
      } catch {}
      timings.knowledge = Math.round(now() - tK0);
    }

    // 7. Related queries — token-overlap clustering against the memory log.
    let related = [];
    if (window.oioxoRelated && typeof window.oioxoRelated.suggest === 'function'){
      const tR0 = now();
      try { related = window.oioxoRelated.suggest(q, { limit: 4 }); } catch {}
      timings.related = Math.round(now() - tR0);
    }

    // 7b. Federation — query any registered external catalog sources in
    //     parallel under their own budget. Merged tools tagged with source.
    let federation = null;
    if (window.oioxoFederation && typeof window.oioxoFederation.search === 'function' &&
        window.oioxoFederation.list && window.oioxoFederation.list().length){
      const tF0 = now();
      try { federation = await window.oioxoFederation.search(q, ctx); } catch {}
      timings.federation = Math.round(now() - tF0);
    }

    // 7c. Bandit impression — record that the winning slug was shown so
    //     future Thompson draws have the data they need.
    if (intent && intent.tool && window.oioxoBandit && typeof window.oioxoBandit.recordImpression === 'function'){
      try { window.oioxoBandit.recordImpression(intent.tool.slug, 0); } catch {}
    }

    // 7d. Web results — federated public-API search (Wikipedia + DDG +
    //     Reddit). Always populated for non-compute queries so the SERP
    //     has a "Web" block beneath tool cards, matching mainstream UX.
    let webResults = null;
    if (window.oioxoWebResults && classification.category !== 'compute' &&
        classification.category !== 'navigation' && classification.category !== 'meta'){
      const tW0 = now();
      try { webResults = await window.oioxoWebResults.search(q, { operators, limit: 8 }); } catch {}
      timings.web = Math.round(now() - tW0);
    }

    // 7e. Safesearch + operator-driven filtering BEFORE downstream consumes
    //     webResults. Order: operators (strict) → safesearch (default-on
    //     NSFW filter) → highlight/cluster/aianswer (which all see the
    //     filtered list).
    if (webResults && window.oioxoOperatorsApply){
      try { webResults = window.oioxoOperatorsApply.applyToWebResults(webResults, operators); } catch {}
    }
    if (webResults && window.oioxoSafesearch){
      try { webResults = window.oioxoSafesearch.filter(webResults); } catch {}
    }

    // 7e-bis. AI answer — extractive synthesis from web results, now
    //         using TF-IDF + QA-pattern + authority weighting when
    //         available.
    let aiAnswer = null;
    if (webResults && webResults.results && webResults.results.length && window.oioxoAiAnswer){
      const tA0 = now();
      try {
        if (window.oioxoTfidf && window.oioxoQaPattern && window.oioxoAuthority){
          // Build sentence pool from snippets.
          const pool = [];
          const sourceMap = [];
          for (let si = 0; si < webResults.results.length; si++){
            const src = webResults.results[si];
            const sentences = (window.oioxoAiAnswer.splitSentences ? window.oioxoAiAnswer.splitSentences(src.snippet || src.title || '') : []);
            for (const s of sentences){ pool.push(s); sourceMap.push(si); }
          }
          if (pool.length){
            const scored = window.oioxoTfidf.score(q, pool);
            const qaKind = window.oioxoQaPattern.classify(q).kind;
            const biased = window.oioxoQaPattern.biasSentences(scored, qaKind);
            // Authority weighting per sentence (via its source).
            const authBiased = biased.map((x) => {
              const src = webResults.results[sourceMap[x.idx]];
              const auth = src && src.url ? window.oioxoAuthority.score(src.url) : 1;
              return Object.assign({}, x, { score: x.score * auth, sourceIdx: sourceMap[x.idx] });
            }).sort((a, b) => b.score - a.score);
            // Build the answer from top distinct sources.
            const used = []; const seenSrc = new Set();
            for (const c of authBiased){
              if (used.length >= 3) break;
              if (seenSrc.has(c.sourceIdx)) continue;
              seenSrc.add(c.sourceIdx);
              used.push(c);
            }
            if (used.length){
              const citations = [];
              const citeMap = new Map();
              const parts = used.map((c) => {
                let n = citeMap.get(c.sourceIdx);
                if (!n){
                  n = citations.length + 1;
                  citeMap.set(c.sourceIdx, n);
                  const src = webResults.results[c.sourceIdx];
                  citations.push({ n, title: src.title, url: src.url, source: src.source });
                }
                return c.sentence.replace(/[.!?]?\s*$/, '') + ' [' + n + ']';
              });
              aiAnswer = {
                kind: 'ai-answer',
                answer: parts.join('. ') + '.',
                citations,
                method: 'tfidf+qa+auth',
                confidence: Math.min(0.9, used[0].score),
              };
            }
          }
        }
        if (!aiAnswer){
          aiAnswer = window.oioxoAiAnswer.synthesize(q, webResults.results, { maxSentences: 3 });
        }
      } catch {}
      timings.aiAnswer = Math.round(now() - tA0);
    }

    // 7e-bis. Highlight query terms in web result snippets so the
    //         renderer can bold them. Pure string transform, no I/O.
    if (webResults && webResults.results && window.oioxoHighlight){
      try { window.oioxoHighlight.highlightAll({ webResults }, q); } catch {}
    }

    // 7e-ter. Cluster web results by host so the renderer can group
    //         "from wikipedia.org (3) / from reddit.com (2)".
    let webClusters = null;
    if (webResults && webResults.results && window.oioxoClusters){
      try { webClusters = window.oioxoClusters.cluster(webResults); } catch {}
    }

    // 7f. Disambiguation — when no specific intent landed and the query is
    //     a single content word with multiple meanings, surface a choice
    //     card instead of guessing wrong.
    let disambiguation = null;
    if (!intent && !plan && window.oioxoDisambiguation){
      try {
        const d = await window.oioxoDisambiguation.detect(q, catalog, { fetchWiki: false });
        if (d) disambiguation = window.oioxoDisambiguation.build(d);
      } catch {}
      if (disambiguation && !intent) intent = disambiguation;
    }

    // 8. Predictive prefetch — hint the browser to fetch the winning tool's
    //    page ahead of any click, when classifier said tool-shaped.
    if (intent && intent.tool && intent.tool.url && window.oioxoPrefetch &&
        classification && classification.category === 'tool'){
      try { window.oioxoPrefetch.hint(intent.tool.url); } catch {}
    }

    // 9. Profile observation — record the category the user landed on so
    //    future ranks can personalise gently.
    if (intent && intent.tool && intent.tool.category && window.oioxoProfile){
      try { window.oioxoProfile.observe(intent.tool.category, 0.5); } catch {}
    }

    const envelope = {
      original: rewrite.original,
      rewritten: q,
      language: rewrite.language,
      translation,
      followup: followupExpansion,
      operators,
      corrections: rewrite.corrections,
      hadQuestionMark: rewrite.hadQuestionMark,
      classification,
      entities,
      knowledge,
      intent,
      plan,
      suggestions,
      related,
      federation,
      webResults,
      webClusters,
      aiAnswer,
      bookmarked: window.oioxoBookmarks && typeof window.oioxoBookmarks.has === 'function'
        ? window.oioxoBookmarks.has(rewrite.original)
        : false,
      timings,
    };

    // 10. Snippets — attach per-intent preview text using entity context.
    if (window.oioxoSnippets && typeof window.oioxoSnippets.forEnvelope === 'function'){
      try { window.oioxoSnippets.forEnvelope(envelope); } catch {}
    }

    // 11. Explain mode — when context.explain=true, attach a debug panel.
    if (window.oioxoExplain && typeof window.oioxoExplain.attach === 'function'){
      try { window.oioxoExplain.attach(envelope, null, context); } catch {}
    }

    // Stamp the detected language onto the intent so the renderer can
    // apply RTL wrapping without needing a separate language parameter
    // at every call site.
    if (envelope.intent && rewrite.language){
      envelope.intent.lang = rewrite.language;
    }

    if (!opts.noCache){
      const k = cacheKey(rawQ, catalog, context);
      cacheSet(k, envelope);
    }
    if (window.oioxoMetrics && typeof window.oioxoMetrics.onEnvelope === 'function'){
      try { window.oioxoMetrics.onEnvelope(envelope); } catch {}
    }
    return envelope;
  }

  /** Empty-state recommendations — surfaces when the search box is empty.
   *  Combines recent queries (memory), recently-used tools (history) and a
   *  small curated set of popular apps. The search UI can render this as a
   *  dropdown beneath an empty input. */
  function emptyState(catalog){
    if (!catalog || !catalog.tools) return { recents: [], tools: [], apps: [] };
    const recents = (window.oioxoMemory && window.oioxoMemory.recent)
      ? window.oioxoMemory.recent(5).map((e) => e.query).filter(Boolean)
      : [];
    const recentSlugs = (window.oioxoHistory && window.oioxoHistory.recent)
      ? window.oioxoHistory.recent(8).map((e) => e.slug)
      : [];
    const tools = recentSlugs
      .map((slug) => catalog.tools.find((t) => t.slug === slug))
      .filter(Boolean)
      .slice(0, 6);
    const apps = catalog.tools.filter((t) => t.appType).slice(0, 6);
    return { recents, tools, apps };
  }

  function clearCache(){ cache.clear(); }

  /** Synchronous variant — skips the async brain stage. Useful for the
   *  search-as-you-type path where we can't await an LLM call. */
  function processSync(rawQ, catalog, opts){
    opts = opts || {};
    const ctx = (opts.context && Object.assign({}, opts.context, { useBrain: false })) || { useBrain: false };
    // Run the same pipeline but without awaiting brain.
    const p = process(rawQ, catalog, Object.assign({}, opts, { context: ctx }));
    return p; // returns a promise that resolves synchronously since brain is skipped
  }

  window.oioxoSerp = { process, processSync, emptyState, clearCache };
})();
