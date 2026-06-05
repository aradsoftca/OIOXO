/**
 * oioxo intent router — translates a natural-language search query into a
 * specific tool match (slug + params + intent type + confidence).
 *
 * Pipeline (highest-confidence wins):
 *   1. App intent      — "open ai", "ai chat", "watch party", "send file", …
 *   2. Studio intent   — "meme maker", "thumbnail", "make a sticker", …
 *   3. Conversion      — "mp4 to avi", "convert png to jpg", "pdf to docx", …
 *   4. Operation       — "compress pdf", "merge audio", "rotate image", …
 *   5. Catalog fuzzy   — keyword scoring across all 400+ tools
 *
 * Each resolver returns { kind, slug, params, confidence, summary?, alts? }
 * or null. The first non-null wins, with the option to fall through to
 * fuzzy if confidence is below a threshold.
 *
 * Attaches as window.oioxoRouter = { resolve(query, catalog), … }.
 */
(function(){
  'use strict';
  if (typeof window === 'undefined') return;
  if (window.oioxoRouter) return;

  // ---- vocab ------------------------------------------------------------

  const STOP = new Set([
    'the','a','an','and','or','of','to','in','for','on','at','by','is','are',
    'my','me','i','do','how','what','when','where','can','vs','with','that',
    'this','your','please','some','any',
  ]);

  // App vocabulary — "intent → slug + params + confidence" for the 9 flagship apps.
  const APP_PATTERNS = [
    { rx: /^(?:open\s+)?(?:oioxo\s+)?(?:ai|ask\s*ai|use\s*ai|chat\s*with\s*ai)\b/i,            slug: 'ai',         conf: 0.95 },
    { rx: /^(?:start|create|join|make)\s+(?:a\s+)?(?:group\s+)?chat\b|^chat\b/i,                slug: 'chat',       conf: 0.92 },
    { rx: /^(?:watch\s*party|sync\s*watch|watch\s*together|host\s*a\s*watch)\b|^watch\b/i,      slug: 'watch',      conf: 0.92 },
    { rx: /^(?:video\s*call|voice\s*call|p2p\s*call|start\s*a\s*call)\b|^call\b/i,              slug: 'call',       conf: 0.92 },
    { rx: /^(?:send\s+(?:a\s+)?file|file\s*send|p2p\s*send|big\s*file\s*send)\b|^send\b/i,      slug: 'send',       conf: 0.92 },
    { rx: /^(?:clipboard\s*sync|cross[- ]device\s*clipboard)\b|^clipboard\b/i,                  slug: 'clipboard',  conf: 0.92 },
    { rx: /^(?:quick\s*note|take\s*a\s*note|on[- ]device\s*note|sync\s*note)\b|^note\b/i,       slug: 'note',       conf: 0.86 },
    { rx: /^(?:whiteboard|sticky\s*notes?|collaboration\s*board)\b|^board\b/i,                  slug: 'board',      conf: 0.86 },
    { rx: /^(?:summari[sz]e|tldr|tl;dr|summar[a-z]*\s+(?:this|article|video|pdf))\b/i,          slug: 'summarize',  conf: 0.90 },
  ];

  // Studio vocabulary — "make/create/design a {studio}".
  const STUDIO_VERB = /^(?:make|create|design|build|generate|new)\s+(?:a\s+|an\s+)?/i;
  const STUDIO_SLUGS = ['avatar','background','collage','gif','invoice','meme','poster','qr','resume','sticker','thumbnail'];
  // Plurals / synonyms that should map to a studio slug. Conversion runs
  // BEFORE studio, so file-extension tokens like "avi"/"mp4"/"png" never
  // reach this map even when they incidentally look like a studio name.
  const STUDIO_SYNONYMS = {
    avatars:'avatar',
    backgrounds:'background', bg:'background', wallpaper:'background',
    collages:'collage', moodboard:'collage',
    gifs:'gif', meme:'meme', memes:'meme',
    invoices:'invoice', bill:'invoice', receipt:'invoice',
    posters:'poster', flyer:'poster',
    qrcode:'qr', qr_code:'qr',
    resumes:'resume', cv:'resume',
    stickers:'sticker',
    thumbnails:'thumbnail', cover:'thumbnail',
  };

  // ---- helpers ----------------------------------------------------------

  function tokenize(q){
    return (q || '').toLowerCase()
      .replace(/[^a-z0-9\s\-]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length >= 1 && !STOP.has(t));
  }
  function isFileExt(token, catalog){
    if (!catalog || !catalog.formatGroups) return null;
    token = token.toLowerCase();
    for (const [group, list] of Object.entries(catalog.formatGroups)) {
      if (list.includes(token)) return group;
    }
    return null;
  }
  function findTool(catalog, slug){
    if (!catalog || !catalog.tools) return null;
    return catalog.tools.find((t) => t.slug === slug) || null;
  }
  function findToolByUrl(catalog, url){
    if (!catalog || !catalog.tools) return null;
    return catalog.tools.find((t) => t.url === url) || null;
  }

  // ---- resolver 1: hardcoded specific intents (preserve old behavior) --

  function resolveSpecific(rawQ, catalog){
    if (!rawQ) return null;
    // QR
    let m = rawQ.match(/^(?:qr(?:\s*code)?|qrcode|generate\s+qr(?:\s*code)?|create\s+qr)\s+(?:for\s+|of\s+)?["']?(.+?)["']?\??$/i);
    if (m) return { kind: 'specific', slug: 'qr-code', params: { text: m[1].trim() }, confidence: 1.0, title: 'QR code', icon: '▦', inputType: 'text' };
    // My IP
    if (/^(?:my\s+ip|what(?:'?s|\s+is)\s+my\s+ip|whats\s+my\s+ip|public\s+ip|ip\s+address)\??$/i.test(rawQ)){
      return { kind: 'specific', slug: 'my-ip', params: {}, confidence: 1.0, title: 'My IP', icon: '🌐', inputType: 'none', summary: "We don't fetch your IP in the search engine — open the full tool for the answer (privacy-preserving, runs on the page you open)." };
    }
    // IP lookup
    m = rawQ.match(/^(?:ip|geolocate|locate|whois|lookup|where\s+is)\s+((?:\d{1,3}\.){3}\d{1,3}|[a-f0-9:]{2,39})\??$/i);
    if (m) return { kind: 'specific', slug: 'ip-lookup', params: { ip: m[1] }, confidence: 1.0, title: 'IP lookup', icon: '🌐', inputType: 'none' };
    m = rawQ.match(/^((?:\d{1,3}\.){3}\d{1,3})$/);
    if (m) return { kind: 'specific', slug: 'ip-lookup', params: { ip: m[1] }, confidence: 1.0, title: 'IP lookup', icon: '🌐', inputType: 'none' };
    return null;
  }

  // ---- resolver 2: app intents -----------------------------------------

  function resolveApp(rawQ, catalog){
    for (const p of APP_PATTERNS){
      if (p.rx.test(rawQ)){
        const tool = findTool(catalog, p.slug);
        if (!tool) continue;
        return {
          kind: 'app',
          slug: tool.slug,
          params: {},
          confidence: p.conf,
          title: tool.name,
          icon: tool.icon || '✦',
          inputType: 'none',
          description: tool.description,
        };
      }
    }
    return null;
  }

  // ---- resolver 3: studio intents --------------------------------------

  function resolveStudio(rawQ, catalog){
    const q = rawQ.toLowerCase().trim();
    let target = null;
    // "make/create/etc. a X" / "X maker/generator/studio"
    let m = q.match(STUDIO_VERB);
    let rest = m ? q.slice(m[0].length) : q;
    rest = rest.replace(/\s+(?:maker|generator|studio|creator|tool)\b/g, '').trim();
    if (STUDIO_SLUGS.includes(rest)) target = rest;
    else if (STUDIO_SYNONYMS[rest]) target = STUDIO_SYNONYMS[rest];
    // Last shot: any single token that's a studio slug.
    if (!target) {
      const toks = tokenize(rest);
      for (const t of toks) {
        if (STUDIO_SLUGS.includes(t)) { target = t; break; }
        if (STUDIO_SYNONYMS[t]) { target = STUDIO_SYNONYMS[t]; break; }
      }
    }
    if (!target) return null;
    // Prefer the studios/{slug} entry when the same slug also exists in
    // another category (e.g. /generators/resume vs /studios/resume).
    const tool = (catalog.tools.find(t => t.slug === target && t.category === 'studios')) || findTool(catalog, target);
    if (!tool || tool.category !== 'studios') return null;
    const verb = m ? m[0].trim() : 'open';
    return {
      kind: 'studio',
      slug: target,
      tool, // honor our /studios/X pick over later /generators/X lookups
      params: {},
      confidence: m ? 0.92 : 0.74,
      title: tool.name + ' studio',
      icon: '🎨',
      inputType: tool.inputType || 'file',
      summary: 'Open the ' + tool.name + ' studio — ' + verb + ' a ' + target + ' on-device.',
    };
  }

  // ---- resolver 4: format conversion ("X to Y") ------------------------

  // Common brand / colloquial names → file extension. Lets "word to pdf",
  // "excel to csv", "h264 to h265" still hit the conversion resolver even
  // when neither token is itself a recognised file extension.
  const FORMAT_ALIASES = {
    'word':'docx','msword':'docx','doc':'docx',
    'excel':'xlsx','xls':'xlsx',
    'powerpoint':'pptx','ppt':'pptx',
    'youtube':'mp4','yt':'mp4',
    'spotify':'mp3',
    'jpeg':'jpg','tif':'tiff','htm':'html',
    'h264':'mp4','h265':'mp4','hevc':'mp4','av1':'mp4','vp9':'webm','vp8':'webm',
    'glb':'gltf','fbx':'glb','obj':'glb','stl':'glb','3ds':'glb',
    'odt':'docx','ods':'xlsx','odp':'pptx',
  };

  function resolveConversion(rawQ, catalog){
    if (!catalog || !catalog.formatGroups) return null;
    // Allow a leading "." (e.g. ".docx to .pdf"), allow brand aliases.
    const m = rawQ.match(/^(?:convert\s+)?\.?([a-z0-9]{2,8})\s*(?:to|→|->|in|into)\s*\.?([a-z0-9]{2,8})\s*(?:converter|file|format)?\??$/i);
    if (!m) return null;
    let from = m[1].toLowerCase();
    let to = m[2].toLowerCase();
    if (FORMAT_ALIASES[from]) from = FORMAT_ALIASES[from];
    if (FORMAT_ALIASES[to]) to = FORMAT_ALIASES[to];
    const groupFrom = isFileExt(from, catalog);
    const groupTo = isFileExt(to, catalog);
    if (!groupFrom && !groupTo) return null;
    const group = groupFrom || groupTo;
    const sameGroup = groupFrom && groupTo && groupFrom === groupTo;

    // 1. Exact slug match → high confidence.
    let tool = catalog.tools.find((t) => t.slug === from + '-to-' + to)
      || catalog.tools.find((t) => t.slug === 'convert-' + from + '-to-' + to);
    if (tool) {
      return makeConversion(tool, from, to, group, 0.99, 'exact');
    }

    // 2. Generic group-converter (same media family). Medium confidence.
    if (sameGroup) {
      if (group === 'video') tool = findToolByUrl(catalog, '/videotools/convert-format-video');
      if (group === 'audio') tool = findToolByUrl(catalog, '/audiotools/convert-format-audio');
      if (group === 'image') tool = findToolByUrl(catalog, '/imagetools/batch-convert');
      if (tool) return makeConversion(tool, from, to, group, 0.86, 'group');
    }

    // 3. No exact tool → honest fallback. Return the closest related tools
    //    in the right category and let the renderer say "no exact X→Y tool,
    //    here are related ones". Better than silently surfacing the wrong
    //    converter (e.g. pdf-to-images for pdf→docx).
    const related = catalog.tools
      .filter((t) => t.formatIn === from || t.formatOut === to || t.formatGroup === group)
      .filter((t) => t.category !== 'apps')
      .slice(0, 3);
    if (!related.length) return null;
    const primary = related[0];
    return {
      kind: 'conversion-fallback',
      slug: primary.slug,
      tool: primary,
      params: { from, to },
      confidence: 0.55,
      title: from.toUpperCase() + ' → ' + to.toUpperCase(),
      icon: group === 'video' ? '🎬' : group === 'audio' ? '🎵' : group === 'image' ? '🖼' : group === 'doc' ? '📄' : '↔',
      inputType: 'file',
      formatIn: from,
      formatOut: to,
      formatGroup: group,
      summary: 'No exact ' + from.toUpperCase() + '→' + to.toUpperCase() + ' tool yet — closest related tools:',
      alternatives: related.slice(1).map((t) => ({ slug: t.slug, name: t.name, url: t.url, score: 0.5 })),
    };
  }
  function makeConversion(tool, from, to, group, confidence, matchType){
    return {
      kind: 'conversion',
      slug: tool.slug,
      tool,
      params: { from, to },
      confidence,
      title: from.toUpperCase() + ' → ' + to.toUpperCase(),
      icon: group === 'video' ? '🎬' : group === 'audio' ? '🎵' : group === 'image' ? '🖼' : group === 'doc' ? '📄' : '↔',
      inputType: 'file',
      formatIn: from,
      formatOut: to,
      formatGroup: group,
      matchType,
    };
  }

  // ---- resolver 5: operation ("compress pdf", "merge audio") -----------

  function resolveOperation(rawQ, catalog){
    if (!catalog || !catalog.tools) return null;
    const q = rawQ.toLowerCase();
    const m = q.match(/^(compress|merge|split|rotate|resize|extract|remove|trim|crop|reverse|enhance|blur|sharpen|normalize|denoise|amplify|fade|caption|subtitle|transcribe|translate)\s+(?:my\s+|a\s+|the\s+|some\s+)?([a-z0-9\s\-]+?)\s*\??$/);
    if (!m) return null;
    const verb = m[1];
    const target = m[2].trim().replace(/\bfile[s]?\b/g, '').trim();
    // Map target word → category list
    const TARGET = {
      pdf:        ['pdftools'],
      image:      ['imagetools'], images: ['imagetools'], photo: ['imagetools'], picture: ['imagetools'],
      video:      ['videotools'], videos: ['videotools'], clip: ['videotools'],
      audio:      ['audiotools'], audios: ['audiotools'], sound: ['audiotools'], mp3: ['audiotools'], music: ['audiotools'],
      subtitle:   ['subtitletools'], subtitles: ['subtitletools'], srt: ['subtitletools'],
      text:       ['texttools'],
      gif:        ['imagetools','studios'],
    };
    const cats = TARGET[target] || (target.length >= 2 ? Object.keys(TARGET).filter((k) => target.includes(k) || k.includes(target)).flatMap((k) => TARGET[k]) : []);
    if (!cats.length) return null;
    // Find a tool whose ops include verb and category matches.
    const candidates = catalog.tools
      .filter((t) => cats.includes(t.category))
      .filter((t) => (t.operations || []).includes(verb) || t.slug.includes(verb));
    if (!candidates.length) return null;
    // Prefer the one whose slug literally is `${verb}-${target}` (e.g. compress-pdf).
    const exact = candidates.find((t) => t.slug === verb + '-' + target) || candidates[0];
    return {
      kind: 'operation',
      slug: exact.slug,
      params: {},
      confidence: exact.slug === verb + '-' + target ? 0.96 : 0.82,
      title: verb[0].toUpperCase() + verb.slice(1) + ' ' + target,
      icon: '🛠',
      inputType: 'file',
      verb, target,
    };
  }

  // ---- resolver 6: catalog fuzzy (keyword scoring) ---------------------

  function scoreTool(tool, qTokens, qLower, context){
    if (!tool || !tool.keywords) return 0;
    let score = 0;
    for (const t of qTokens){
      let hit = 0;
      for (const kw of tool.keywords){
        if (kw === t) { hit = Math.max(hit, 1.5); break; }
        if (kw.indexOf(t) >= 0 || (t.length >= 4 && t.indexOf(kw) >= 0)) hit = Math.max(hit, 1.0);
      }
      score += hit;
    }
    if (score === 0) return 0;
    if (qLower.indexOf(tool.slug.replace(/-/g, ' ')) >= 0) score += 3;
    if (qLower.indexOf(tool.category) >= 0) score += 1;
    if (tool.appType && qLower.indexOf(tool.appType) >= 0) score += 2;
    // History boost — recent tools surface higher.
    if (window.oioxoHistory && typeof window.oioxoHistory.scoreBoost === 'function'){
      score += window.oioxoHistory.scoreBoost(tool.slug);
    }
    return score;
  }

  function resolveCatalog(rawQ, catalog, context){
    if (!catalog || !catalog.tools) return null;
    const qLower = rawQ.toLowerCase();
    const qTokens = tokenize(rawQ);
    if (!qTokens.length) return null;
    const scored = [];
    for (const t of catalog.tools){
      // Tier gate: if context.tier === 'free' and tool is 'pro', SOFT-demote
      // (keep but reduce score) so we still surface it with a Pro badge.
      let s = scoreTool(t, qTokens, qLower, context);
      if (context && context.tier === 'free' && t.tier === 'pro') s *= 0.7;
      if (s >= 1.5) scored.push({ tool: t, score: s });
    }
    if (!scored.length) return null;
    scored.sort((a, b) => b.score - a.score);
    const top = scored[0];
    if (top.score < 2.5) return null;
    return {
      kind: 'catalog',
      slug: top.tool.slug,
      params: {},
      confidence: Math.min(1.0, top.score / 6.0),
      title: top.tool.name,
      icon: '◆',
      inputType: top.tool.inputType || 'none',
      alternatives: scored.slice(1, 4).map((x) => ({ slug: x.tool.slug, name: x.tool.name, url: x.tool.url, score: x.score })),
    };
  }

  // ---- public API -------------------------------------------------------

  // LRU memoization. Resolution is pure given (query, catalog.version) — the
  // catalog reloads only when the loader hands us a new blob, so caching by
  // (catalog.version, normalized-query) is safe. Keeps the last 50 resolves.
  const MEMO_LIMIT = 50;
  const memo = new Map(); // key → { result, ts }
  function memoGet(key){
    const e = memo.get(key);
    if (!e) return undefined;
    // Refresh LRU position by re-inserting.
    memo.delete(key); memo.set(key, e);
    return e.result;
  }
  function memoSet(key, result){
    if (memo.has(key)) memo.delete(key);
    memo.set(key, { result, ts: Date.now() });
    while (memo.size > MEMO_LIMIT) memo.delete(memo.keys().next().value);
  }
  function memoKey(rawQ, catalog){
    return (catalog && catalog.version != null ? catalog.version : 'v?') + ':' +
      (rawQ || '').trim().toLowerCase().replace(/\s+/g, ' ');
  }

  // Telemetry — anyone can listen to (q, intent, durationMs). Useful for
  // observability dashboards or local debugging; emitting is no-op if no
  // listener is registered.
  const listeners = new Set();
  function emit(payload){
    for (const fn of listeners){ try { fn(payload); } catch {} }
  }

  // Async escalation to the conductor LLM. Activates only when the
  // synchronous stages all returned null AND a brain bridge is wired
  // (window.oioxoConductor.classify). The bridge module gracefully no-ops
  // when not present so the rest of the pipeline keeps working.
  async function resolveBrain(rawQ, catalog, context){
    if (!window.oioxoBrainBridge || !window.oioxoBrainBridge.isAvailable()) return null;
    try { return await window.oioxoBrainBridge.route(rawQ, catalog, context); }
    catch { return null; }
  }

  const STAGES = [
    ['specific',   resolveSpecific],
    ['app',        resolveApp],
    ['conversion', resolveConversion],
    ['operation',  resolveOperation],
    ['studio',     resolveStudio],
    ['catalog',    resolveCatalog],
  ];

  function tierKey(context){
    if (!context) return '';
    return (context.tier || '') + '|' + (context.surface || '') + '|' + (context.variant || '');
  }

  /** Resolve the highest-confidence intent for a query. Returns `null` if
   *  no synchronous resolver matches. For the async brain escalation, call
   *  `resolveAsync()`.
   *  opts: {
   *    debug   — return { winner, trace, durationMs }
   *    noCache — skip memoization
   *    context — ResolverContext { tier, surface, recentTools, openApps,
   *              locale, capabilities, variant, useBrain }
   *  } */
  function resolve(rawQ, catalog, opts){
    opts = opts || {};
    if (!rawQ || typeof rawQ !== 'string') return null;
    // Normalise once. Each stage gets the trimmed value so leading/trailing
    // whitespace and trailing "?" don't sabotage anchored regexes.
    rawQ = rawQ.trim();
    if (!rawQ) return null;
    const context = opts.context || null;
    const key = memoKey(rawQ, catalog) + ':' + tierKey(context);
    if (!opts.noCache && !opts.debug){
      const cached = memoGet(key);
      if (cached !== undefined) {
        emit({ q: rawQ, intent: cached, cached: true, durationMs: 0, context });
        return cached;
      }
    }
    const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    const trace = opts.debug ? [] : null;
    let winner = null;
    for (const [name, stage] of STAGES){
      const s0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
      let r = null;
      try { r = stage(rawQ, catalog, context); } catch (e) { if (trace) trace.push({ stage: name, error: String(e && e.message || e), ms: 0 }); continue; }
      const s1 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
      if (r){
        if (!r.tool) r.tool = findTool(catalog, r.slug);
        if (trace) trace.push({ stage: name, slug: r.slug, tool: r.tool && r.tool.url, confidence: r.confidence, ms: Math.round(s1 - s0) });
        if (r.tool && !winner) winner = r;
        if (!opts.debug && winner) break; // stop at first hit unless in debug mode
      } else if (trace) {
        trace.push({ stage: name, slug: null, ms: Math.round(s1 - s0) });
      }
    }
    const t1 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    const durationMs = Math.round(t1 - t0);
    if (!opts.noCache) memoSet(key, winner);
    emit({ q: rawQ, intent: winner, cached: false, durationMs, context });
    if (opts.debug) return { winner, trace, durationMs };
    return winner;
  }

  /** Same as resolve(), but also runs the async brain stage when no
   *  synchronous stage produced a winner AND context.useBrain !== false.
   *  Memoizes the awaited result so subsequent calls don't await again. */
  async function resolveAsync(rawQ, catalog, opts){
    const sync = resolve(rawQ, catalog, opts);
    if (sync) return sync;
    const context = (opts && opts.context) || null;
    if (context && context.useBrain === false) return null;
    if (!window.oioxoBrainBridge || !window.oioxoBrainBridge.isAvailable()) return null;
    try {
      const r = await resolveBrain(rawQ.trim(), catalog, context);
      if (r && r.tool){
        const key = memoKey(rawQ, catalog) + ':' + tierKey(context);
        memoSet(key, r);
        emit({ q: rawQ, intent: r, cached: false, durationMs: r.brainMs || 0, brain: true, context });
        return r;
      }
    } catch {}
    return null;
  }

  /** All non-winning intents, useful for debug / explainability. */
  function resolveAll(rawQ, catalog){
    const results = {};
    for (const [name, fn] of STAGES){
      let r = null;
      try { r = fn(rawQ, catalog); } catch (e) { results[name] = { error: String(e && e.message || e) }; continue; }
      if (r){
        if (!r.tool) r.tool = findTool(catalog, r.slug);
        results[name] = r;
      }
    }
    return results;
  }

  function onResolve(fn){
    if (typeof fn !== 'function') return () => {};
    listeners.add(fn);
    return () => listeners.delete(fn);
  }
  function clearMemo(){ memo.clear(); }

  /** plan(query, catalog, opts?) — delegate to oioxoPlanner. Returns a
   *  PlannedChain when the query has multiple segments, otherwise null. */
  function plan(rawQ, catalog, opts){
    if (!window.oioxoPlanner) return null;
    try { return window.oioxoPlanner.plan(rawQ, catalog, (opts && opts.context) || null); }
    catch { return null; }
  }

  /** capabilities(catalog) — proxy to graph capability negotiation API. */
  function capabilities(catalog){
    if (!window.oioxoCapabilityGraph) return null;
    try { return window.oioxoCapabilityGraph.capabilities(catalog); }
    catch { return null; }
  }

  window.oioxoRouter = {
    resolve, resolveAsync, resolveAll, plan, capabilities,
    onResolve, clearMemo, tokenize, scoreTool,
  };
})();
