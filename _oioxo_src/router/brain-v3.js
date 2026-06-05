/**
 * Brain v3 IIFE shim — exposes a `planTurn(message, history)` adapter that
 * runs the v3 SmolVLM-256M-Brain through the existing `loadBrain()` pipeline
 * already wired in search.html, then registers it with oioxoBrainBridge so
 * the router (intents.js / chainrunner.js) can escalate to LLM tool-routing
 * and chain planning.
 *
 * search.html's loadBrain() owns the heavy lifting:
 *   • ECDHE handshake against /api/ai-key (origin-gated)
 *   • AES-GCM decrypt of the encrypted weights on Hugging Face
 *   • transformers.js pipeline boot with WebGPU/WASM fallback
 *   • pipe.__oioxoBrainV3 marker → v3 plan-JSON system prompt
 *
 * We DON'T duplicate that here — we only adapt the call shape. When the user
 * hasn't enabled the brain toggle, loadBrain rejects and we leave the bridge
 * un-registered; intents.js falls through to web search like today.
 *
 * Exposes window.oioxoBrainV3 = { planTurn, register }.
 */
(function(){
  'use strict';
  if (typeof window === 'undefined') return;
  if (window.oioxoBrainV3) return;

  // Mirrored from lib/ai/brain-runtime.ts BRAIN_SYSTEM. KEEP IN SYNC.
  // search.html already defines _BRAIN_V3_SYSTEM with the same text; we ship
  // our own copy here so this asset is self-contained when loaded encrypted.
  const SYSTEM =
    "You are oioxo's planning brain. You run on every user turn. Given the " +
    "user's latest message, any attached file/image, and the conversation so " +
    "far, output ONLY a JSON plan and nothing else: " +
    '{"turnRole":one of new-goal|parameter|append-step|correction|confirmation|' +
    'question|chitchat|outcome,' +
    '"goal":string,' +
    '"chain":[{"step":"surface:id","can":bool,"alternative":string-when-false}],' +
    '"params":object,' +
    '"mediaNeed":none|image-search|ocr|video-transcript,' +
    '"style":{"format":string,"length":string,"tone":string,"lang":string},' +
    '"remember":string-when-user-states-a-preference-to-store,' +
    '"ask":string-when-blocked-on-missing-info,' +
    '"reply":string}. ' +
    'Surfaces: tool:<id> chain:<id1,id2,...> studio:<id> app:<id> vision:<op> ' +
    'search:<shape> memory:<op> limit:<what>. ' +
    'Honesty: can:false REQUIRES a non-empty alternative naming what we CAN do. ' +
    "Reply rules: NEVER 'As an AI', NEVER 'Sure! Here\\'s', NEVER 'Hope this helps', " +
    "NEVER 'Is there anything else'. Match user brevity. Match emotional register. " +
    'Cite verifiable claims, skip for math/personal. Refer to human experts for ' +
    'medical/legal/financial/crisis. Never claim physical perception. Defer recency ' +
    'to live search. Confirm before destructive ops. Respect cultural context. ' +
    'Track the goal across turns; a new message usually MODIFIES the running goal.';

  function buildUser(message, history){
    const lines = [];
    if (Array.isArray(history) && history.length){
      lines.push('Conversation so far:');
      for (const h of history){
        if (!h || !h.text) continue;
        lines.push((h.role === 'user' ? 'User' : 'oioxo') + ': ' + h.text);
      }
    }
    lines.push('User: ' + message);
    return lines.join('\n');
  }

  // ── PLAN REPAIR (mirror of brain-runtime.ts — keep in sync) ───────────────
  // The 256M brain occasionally truncates the JSON, loops a token, or emits a
  // chain step missing the surface:id form. Repair structurally rather than
  // dropping the whole plan, so the search engine's brain is as robust as the
  // chat shell's. Lifts JSON-valid + chain-typecheck toward 100% with no retrain.
  function _balanceClose(s){
    const stack = []; let inStr = false, esc = false;
    for (const ch of s){
      if (inStr){ if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === '"') inStr = false; continue; }
      if (ch === '"') inStr = true;
      else if (ch === '{') stack.push('}');
      else if (ch === '[') stack.push(']');
      else if (ch === '}' || ch === ']') stack.pop();
    }
    let out = s; if (inStr) out += '"';
    while (stack.length) out += stack.pop();
    return out;
  }
  function _repairJson(raw){
    const open = raw.indexOf('{');
    if (open < 0) return null;
    let s = raw.slice(open);
    const close = s.lastIndexOf('}');
    if (close >= 0){ try { return JSON.parse(s.slice(0, close + 1)); } catch (_){} }
    const t = s.replace(/(.)\1{40,}/g, '$1$1').replace(/,\s*$/,'');
    const cand = _balanceClose(t).replace(/,\s*([}\]])/g, '$1');
    try { return JSON.parse(cand); } catch (_) { return null; }
  }
  const _SURFACE_RE = /^(?:tool|chain|studio|app|vision|search|memory|limit|chat):.+/;
  function _normChain(chain){
    if (!Array.isArray(chain)) return [];
    const out = [];
    for (const c of chain){
      if (!c) continue;
      const step = (typeof c === 'string' ? c : (typeof c.step === 'string' ? c.step : '')).trim();
      if (!_SURFACE_RE.test(step)) continue;
      const can = typeof c.can === 'boolean' ? c.can : true;
      const o = { step: step, can: can };
      if (!can) o.alternative = (typeof c.alternative === 'string' && c.alternative.trim()) || 'show you the closest thing we can do';
      out.push(o);
    }
    return out;
  }
  function parsePlan(raw){
    if (!raw) return null;
    const j = _repairJson(raw);
    if (!j || typeof j.reply !== 'string') return null;
    const st = (j.style && typeof j.style === 'object') ? j.style : {};
    return {
      turnRole: j.turnRole || 'new-goal',
      goal: typeof j.goal === 'string' ? j.goal : '',
      chain: _normChain(j.chain),
      params: (j.params && typeof j.params === 'object') ? j.params : {},
      mediaNeed: ['none','image-search','ocr','video-transcript'].includes(j.mediaNeed) ? j.mediaNeed : 'none',
      style: { format: st.format || 'prose', length: st.length || 'default', tone: st.tone || 'default', lang: typeof st.lang === 'string' ? st.lang : null },
      remember: typeof j.remember === 'string' ? j.remember : '',
      ask: typeof j.ask === 'string' ? j.ask : '',
      reply: j.reply,
    };
  }

  /** Reuses search.html's loadBrain — which does the ECDHE+AES handshake +
   *  primes the transformers.js cache + boots the pipeline. Returns the v3
   *  plan, or null if the brain isn't loaded / failed to plan. */
  async function planTurn(message, history){
    if (typeof window.loadBrain !== 'function') return null;
    let pipeBundle = null;
    try { pipeBundle = await window.loadBrain(); }
    catch { return null; }
    if (!pipeBundle || !pipeBundle.pipe) return null;
    // Don't run the plan path against the public placeholder model — it won't
    // emit the JSON plan, just generic prose.
    if (!pipeBundle.pipe.__oioxoBrainV3) return null;
    try {
      const messages = [
        { role: 'system', content: SYSTEM },
        { role: 'user',   content: buildUser(message, history) },
      ];
      const out = await pipeBundle.pipe(messages, {
        max_new_tokens: 1024, do_sample: false, return_full_text: false,
      });
      const raw = Array.isArray(out) ? (out[0]?.generated_text || '') : (out?.generated_text || '');
      const text = typeof raw === 'string' ? raw
        : (Array.isArray(raw) ? (raw[raw.length-1]?.content || '') : '');
      return parsePlan(text);
    } catch { return null; }
  }

  /** Install ourselves on the bridge. The bridge consumes BrainPlan and adapts
   *  it to both ResolvedIntent (for intents.js) and chain[] (for chainrunner). */
  function register(){
    if (!window.oioxoBrainBridge || typeof window.oioxoBrainBridge.register !== 'function') return false;
    return window.oioxoBrainBridge.register({ planTurn });
  }

  window.oioxoBrainV3 = { planTurn, register };

  // Auto-register when both we and the bridge are present. If the bridge
  // loads after us, search.html's bootstrap loop retries this on the next
  // idle tick — see the brain-bridge-install pattern in search.html.
  if (window.oioxoBrainBridge && typeof window.oioxoBrainBridge.register === 'function'){
    register();
  }
})();
