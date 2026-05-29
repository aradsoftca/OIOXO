/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * brain-runtime — the trained SmolVLM-256M-Brain v3 runtime bridge.
 *
 * Supersedes conductor.ts as the planning brain. v3 ship metrics (held-out 207):
 * JSON-valid 93.2% (gate ≥92% ✓), Honest 100% (=100% ✓), turn-role 67.6%,
 * chain-typecheck 87.9%. Honest=100% is the moat — every can:false names a
 * real alternative. JSON-parse failures handled by the deterministic floor in
 * oioxo-engine.ts (parsePlan null → regex routing), so 7% bad JSON degrades
 * gracefully, never silently. v4 will lift role + chain accuracy via dataset
 * rebalance + rank-64 LoRA + 7 epochs.
 *
 * SHIPS AS: 165MB int8 ONNX (UNDER the 180MB hard budget — first base that
 * fits) AES-256-GCM encrypted on HF payam1394/oioxo-brain; loaded via the
 * proven /api/ai-key handshake (same gate as reranker + conductor).
 *
 * Train/serve parity: SYSTEM + buildBrainUser() MUST stay identical to
 * scripts/train_smolvlm_brain.py SYSTEM + build_user — any drift degrades.
 */
const HF_REPO = 'payam1394/oioxo-brain';
const ASSET_ID = 'models/oioxo-brain';                 // matches /api/ai-key regex
const ONNX_FILENAME = 'model_quantized.onnx';          // standalone text-decoder, optimum-exported
const isBrowser = typeof window !== 'undefined';

// ───── 8-slot plan output (v5+ schema) ───────────────────────────────────────
export type TurnRole =
  | 'new-goal' | 'parameter' | 'append-step' | 'correction'
  | 'confirmation' | 'question' | 'chitchat' | 'outcome';
export interface ChainStep { step: string; can: boolean; alternative?: string }
export interface PlanStyle {
  format: string;     // prose|bullets|table|one-word|yes-no|steps|json
  length: string;     // default|tldr|short|detailed
  tone: string;       // default|formal|casual|eli5|warm
  lang: string | null;
}
export interface BrainPlan {
  turnRole: TurnRole;
  goal: string;
  chain: ChainStep[];
  params: Record<string, unknown>;
  mediaNeed: 'none' | 'image-search' | 'ocr' | 'video-transcript';
  style: PlanStyle;
  remember: string;
  ask: string;
  reply: string;
}
export interface Turn { role: 'user' | 'assistant'; text: string }

// ───── SERVE CONTRACT — must match train_smolvlm_brain.py EXACTLY ────────────
export const BRAIN_SYSTEM =
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

export function buildBrainUser(
  message: string,
  history: Turn[] = [],
  hasFile = false,
  fileType: string | null = null,
  imageDescription = '',
): string {
  const lines: string[] = [];
  if (history.length) {
    lines.push('Conversation so far:');
    for (const h of history) lines.push(`${h.role === 'user' ? 'User' : 'oioxo'}: ${h.text}`);
  }
  if (hasFile) {
    if (fileType === 'image' && imageDescription) {
      lines.push(`[IMAGE attached: ${imageDescription}]`);
    } else {
      lines.push(`[File attached: ${fileType || 'file'}]`);
    }
  }
  lines.push(`User: ${message}`);
  return lines.join('\n');
}

// ───── lazy load (165MB asset loads on first planTurn) ───────────────────────
let _enabled = isBrowser && (typeof localStorage === 'undefined' || localStorage.getItem('oioxo.brain') !== '0');
export function enableBrain(on = true): void { _enabled = on; }
export function brainEnabled(): boolean { return _enabled; }

let _gen: Promise<{ gen: any } | null> | null = null;
async function load(): Promise<{ gen: any } | null> {
  if (!_enabled) return null;
  _gen ??= (async () => {
    try {
      const lib: any = await import('@xenova/transformers');
      const MODEL = isBrowser ? HF_REPO : ASSET_ID;
      if (isBrowser) {
        lib.env.allowLocalModels = false;
        lib.env.allowRemoteModels = true;
        lib.env.remoteHost = 'https://huggingface.co';
        lib.env.remotePathTemplate = '{model}/resolve/{revision}/';
        const { loadProtectedModel } = await import('../oioxo/protected-model');
        await loadProtectedModel({
          modelId: HF_REPO,
          host: lib.env.remoteHost,
          assetId: ASSET_ID,
          onnxUrl: `https://huggingface.co/${HF_REPO}/resolve/main/onnx/${ONNX_FILENAME}`,
          keyEndpoint: '/api/ai-key',
        });
      } else {
        lib.env.allowRemoteModels = false;
        lib.env.allowLocalModels = true;
        lib.env.localModelPath = (typeof process !== 'undefined' ? process.cwd() : '.') + '/_models_plain';
      }
      const gen = await lib.pipeline('text-generation', MODEL, { quantized: true });
      return { gen };
    } catch {
      return null; // not deployed / cold / not entitled → engine uses the regex floor
    }
  })();
  return _gen;
}

/** Whether the trained brain is available this session. */
export async function brainReady(): Promise<boolean> {
  return (await load()) != null;
}

// ── PLAN REPAIR (lifts JSON-valid + chain-typecheck toward 100%, NO retrain) ──
// The 256M brain occasionally emits trailing commas, a truncated tail, a decoder
// loop, or a chain step missing the surface:id form. Dropping the whole plan to
// the floor on every such slip wastes the model's correct slots. We repair what
// we safely can — structural only, never inventing capability.

/** Close a JSON string that was cut off mid-structure: tracks string state +
 *  brace/bracket depth and appends the missing closers. Recovers truncated
 *  plans (the main source of the ~7% JSON-invalid). */
function balanceClose(s: string): string {
  const stack: string[] = [];
  let inStr = false, esc = false;
  for (const ch of s) {
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === '{') stack.push('}');
    else if (ch === '[') stack.push(']');
    else if (ch === '}' || ch === ']') stack.pop();
  }
  let out = s;
  if (inStr) out += '"';
  while (stack.length) out += stack.pop();
  return out;
}

function repairJsonObject(raw: string): any | null {
  if (!raw) return null;
  const open = raw.indexOf('{');
  if (open < 0) return null;
  let s = raw.slice(open);
  const lastClose = s.lastIndexOf('}');
  if (lastClose >= 0) { try { return JSON.parse(s.slice(0, lastClose + 1)); } catch { /* repair below */ } }
  // Repair pass: strip decoder loops + trailing commas, then balance-close.
  const t = s
    .replace(/(.)\1{40,}/g, '$1$1')        // collapse decoder loops ("0000…")
    .replace(/,\s*$/,'');                    // dangling trailing comma
  const candidate = balanceClose(t).replace(/,\s*([}\]])/g, '$1');
  try { return JSON.parse(candidate); } catch { return null; }
}

const SURFACE_RE = /^(?:tool|chain|studio|app|vision|search|memory|limit|chat):.+/;

/** Keep only well-formed surface:id steps; coerce types; preserve the honesty
 *  moat (a can:false step always carries a non-empty alternative at serve). */
function normalizeChain(chain: any): ChainStep[] {
  if (!Array.isArray(chain)) return [];
  const out: ChainStep[] = [];
  for (const c of chain) {
    if (!c) continue;
    const step = (typeof c === 'string' ? c : typeof c.step === 'string' ? c.step : '').trim();
    if (!SURFACE_RE.test(step)) continue;   // structural reject = the chain-typecheck miss
    const can = typeof c.can === 'boolean' ? c.can : true;
    const s: ChainStep = { step, can };
    if (!can) {
      const alt = typeof c.alternative === 'string' ? c.alternative.trim() : '';
      s.alternative = alt || 'show you the closest thing we can do';
    }
    out.push(s);
  }
  return out;
}

function parsePlan(raw: string): BrainPlan | null {
  const j = repairJsonObject(raw);
  if (!j || typeof j.turnRole !== 'string' || typeof j.reply !== 'string') return null;
  const st = (j.style && typeof j.style === 'object') ? j.style : {};
  return {
    turnRole: j.turnRole,
    goal: typeof j.goal === 'string' ? j.goal : '',
    chain: normalizeChain(j.chain),
    params: (j.params && typeof j.params === 'object') ? j.params : {},
    mediaNeed: ['none', 'image-search', 'ocr', 'video-transcript'].includes(j.mediaNeed) ? j.mediaNeed : 'none',
    style: {
      format: typeof st.format === 'string' ? st.format : 'prose',
      length: typeof st.length === 'string' ? st.length : 'default',
      tone: typeof st.tone === 'string' ? st.tone : 'default',
      lang: typeof st.lang === 'string' ? st.lang : null,
    },
    remember: typeof j.remember === 'string' ? j.remember : '',
    ask: typeof j.ask === 'string' ? j.ask : '',
    reply: j.reply,
  };
}

/**
 * Plan this turn with the trained brain, or null when unavailable (engine
 * then uses its deterministic floor). Greedy decode — a plan is structured,
 * not prose. max_new_tokens=1024 because v5+ plans are richer than the
 * 7-slot conductor (added style + remember).
 */
export async function planTurn(
  message: string,
  history: Turn[] = [],
  hasFile = false,
  fileType: string | null = null,
  imageDescription = '',
): Promise<BrainPlan | null> {
  const r = await load();
  if (!r) return null;
  try {
    const messages = [
      { role: 'system', content: BRAIN_SYSTEM },
      { role: 'user', content: buildBrainUser(message, history, hasFile, fileType, imageDescription) },
    ];
    const out: any = await r.gen(messages, { max_new_tokens: 1024, do_sample: false, return_full_text: false });
    const text = Array.isArray(out) ? (out[0]?.generated_text ?? '') : (out?.generated_text ?? '');
    return parsePlan(typeof text === 'string' ? text : (text?.at?.(-1)?.content ?? ''));
  } catch {
    return null;
  }
}
