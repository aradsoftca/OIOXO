/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * conductor — the trained agentic planning brain at RUNTIME (the integration bridge).
 *
 * Loads the conductor (SmolLM2-360M, distilled from Pro on the multi-turn agentic
 * dataset), runs the SAME serve contract the trainer used (train/serve parity — the
 * anti-drift rule), and parses the JSON plan. The engine calls `planTurn` to drive
 * routing + the agentic behaviors (turn-role, chain, can't-do→offer, style, remember,
 * media-need). Cold / not-deployed / not-entitled → returns null and the engine keeps
 * its deterministic regex floor (the reliability contract — never worse than today).
 *
 * Same crown-jewel gate as the reranker/fuser (project_anti_copy): weights ship
 * AES-256-GCM ENCRYPTED on HF; the per-session key is minted only by our origin
 * (/api/ai-key) after a device-bound handshake. Degrades to null gracefully.
 */
const HF_REPO = 'payam1394/oioxo-conductor';
const ASSET_ID = 'models/oioxo-conductor'; // entitlement key id — matches /api/ai-key regex
const isBrowser = typeof window !== 'undefined';

export type TurnRole =
  | 'new-goal' | 'parameter' | 'append-step' | 'correction'
  | 'confirmation' | 'question' | 'chitchat' | 'outcome';
export interface ChainStep { step: string; can: boolean; alternative?: string }
export interface ConductorPlan {
  turnRole: TurnRole;
  goal: string;
  chain: ChainStep[];
  params: Record<string, unknown>;
  mediaNeed: 'none' | 'image-search' | 'ocr';
  style: { format: string; length: string; tone: string; lang: string | null };
  remember: string;
  ask: string;
  reply: string;
}
export interface Turn { role: 'user' | 'assistant'; text: string }

// SERVE CONTRACT — MUST match scripts/train_conductor_brain.py SYSTEM + build_user
// EXACTLY (any drift degrades the model). Single source of truth at runtime.
export const CONDUCTOR_SYSTEM =
  "You are oioxo's planning brain. You run on every turn. Given the user's latest " +
  'message, the conversation so far, and whether a file is attached, output ONLY a ' +
  'JSON plan and nothing else: {"turnRole":one of new-goal|parameter|append-step|' +
  'correction|confirmation|question|chitchat, "goal":string, "chain":[{"step":' +
  'string,"can":bool,"alternative":string-when-can-false}], "params":object, ' +
  '"mediaNeed":none|image-search|ocr, "ask":string, "reply":string}. A step we ' +
  'cannot do must set can:false and name the nearest thing we CAN do as alternative. ' +
  'Track the goal across turns; a new message usually MODIFIES the running goal.';

export function buildConductorUser(message: string, history: Turn[] = [], hasFile = false, fileType: string | null = null): string {
  const lines: string[] = [];
  if (history.length) {
    lines.push('Conversation so far:');
    for (const h of history) lines.push(`${h.role === 'user' ? 'User' : 'oioxo'}: ${h.text}`);
  }
  if (hasFile) lines.push(`[File attached: ${fileType || 'file'}]`);
  lines.push(`User: ${message}`);
  return lines.join('\n');
}

// LIVE: the trained conductor is deployed (encrypted on HF payam1394/oioxo-conductor;
// key minted by /api/ai-key). ON by default in the browser; explicit opt-out via
// localStorage 'oioxo.conductor'='0' (e.g. for the deterministic-floor A/B baseline).
// Safe either way — a cold/denied/slow load returns null and the engine keeps its
// regex floor (reliability contract), and the never-block cap ships the floor answer
// if the model is slow to warm. Lazy: the ~364MB asset loads on the first planTurn.
let _enabled = isBrowser && (typeof localStorage === 'undefined' || localStorage.getItem('oioxo.conductor') !== '0');
export function enableConductor(on = true): void { _enabled = on; }
export function conductorEnabled(): boolean { return _enabled; }

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
          modelId: HF_REPO, host: lib.env.remoteHost, assetId: ASSET_ID,
          onnxUrl: `https://huggingface.co/${HF_REPO}/resolve/main/onnx/decoder_model_merged_quantized.onnx`,
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

/** Whether the trained conductor is available this session. */
export async function conductorReady(): Promise<boolean> {
  return (await load()) != null;
}

function parsePlan(raw: string): ConductorPlan | null {
  try {
    const j = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1));
    if (!j || typeof j.turnRole !== 'string' || typeof j.reply !== 'string') return null;
    return {
      turnRole: j.turnRole, goal: j.goal ?? '', chain: Array.isArray(j.chain) ? j.chain : [],
      params: j.params ?? {}, mediaNeed: j.mediaNeed ?? 'none',
      style: j.style ?? { format: 'prose', length: 'default', tone: 'default', lang: null },
      remember: j.remember ?? '', ask: j.ask ?? '', reply: j.reply,
    };
  } catch { return null; }
}

/**
 * Plan this turn with the trained conductor, or null when it's unavailable (engine
 * then uses its deterministic floor). Greedy decode — a plan is structured, not prose.
 */
export async function planTurn(message: string, history: Turn[] = [], hasFile = false, fileType: string | null = null): Promise<ConductorPlan | null> {
  const r = await load();
  if (!r) return null;
  try {
    const messages = [
      { role: 'system', content: CONDUCTOR_SYSTEM },
      { role: 'user', content: buildConductorUser(message, history, hasFile, fileType) },
    ];
    const out: any = await r.gen(messages, { max_new_tokens: 400, do_sample: false, return_full_text: false });
    const text = Array.isArray(out) ? (out[0]?.generated_text ?? '') : (out?.generated_text ?? '');
    return parsePlan(typeof text === 'string' ? text : (text?.at?.(-1)?.content ?? ''));
  } catch {
    return null;
  }
}
