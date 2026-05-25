/**
 * oioxo Agentic IDE / Code (OIOXO_CODE.md §6) — the conductor INFERENCE side
 * (conductor.ts is the training-data side). The conductor is a tiny specialized
 * model that runs the loop's roles (plan / rank / fix). It ships as a Pro
 * protected asset (see CONDUCTOR_SERVING.md): until it's exported from arad,
 * quantized and hosted, `conductorModel()` is null and every role FALLS BACK to
 * the coder model — so behavior is correct today and the specialist slots in
 * later with no call-site changes.
 *
 * This is the single seam where model selection + the Pro gate live, so revenue
 * (entitlement) and the moat (fine-tuned conductor) plug in here, not scattered.
 */
import { chatStream } from './runtime';
import type { Role } from './conductor';

export interface ConductorConfig {
  /** web-llm model match for the specialized conductor, or null → use the coder. */
  model: string[] | null;
  /** OUR conductor served as ONNX via transformers.js (sidesteps web-llm/MLC):
   *  { modelId, host, protected }. Preferred when set + entitled. See conductor-wasm.ts.
   *  `protected` = AES-encrypted weights gated by /api/code-key (anti-copy). */
  wasm?: { modelId: string; host?: string; protected?: boolean } | null;
  /** Whether the loader is allowed to use it (Pro entitlement). Gated by revenue. */
  entitled: boolean;
}

let _config: ConductorConfig = { model: null, wasm: null, entitled: false };

/** Point the engine at a hosted conductor model (called once it's served + the
 *  user is entitled). Leaving it unset keeps the coder-fallback behavior. */
export function configureConductor(c: Partial<ConductorConfig>): void {
  _config = { ..._config, ...c };
}

/** The conductor model match to use, or null when we should fall back to the coder. */
export function conductorModel(): string[] | null {
  return _config.entitled ? _config.model : null;
}

/** Our ONNX/transformers.js conductor config, if entitled. */
export function conductorWasm(): { modelId: string; host?: string; protected?: boolean } | null {
  return _config.entitled ? _config.wasm ?? null : null;
}

/** True when a specialized conductor is configured AND entitled (either path). */
export function conductorAvailable(): boolean {
  return !!conductorModel() || !!conductorWasm();
}

/**
 * Run one conductor role. Uses the specialized conductor model when available,
 * otherwise the caller's coder `match` (fallback). Returns the raw model text;
 * the caller parses it (parsePlan for 'plan', edit-parse for 'fix', etc).
 */
export async function runRole(
  _role: Role,
  system: string,
  user: string,
  coderMatch: string[],
  opts?: { maxTokens?: number; onProgress?: (p: number) => void; onToken?: (delta: string) => void },
): Promise<string> {
  // Our ONNX conductor (transformers.js) when entitled+configured — the specialist.
  const wasm = conductorWasm();
  if (wasm) {
    const { conductorChat } = await import('./conductor-wasm');
    const text = await conductorChat(wasm, system, user, { maxTokens: opts?.maxTokens ?? 360, onProgress: opts?.onProgress });
    opts?.onToken?.(text); // (non-streamed here; surfaced as one block)
    return text;
  }
  // Else: web-llm conductor match if set, otherwise the coder (fallback).
  const match = conductorModel() ?? coderMatch;
  let acc = '';
  for await (const delta of chatStream(
    match,
    [{ role: 'system', content: system }, { role: 'user', content: user }],
    { maxTokens: opts?.maxTokens ?? 320, onProgress: opts?.onProgress },
  )) {
    acc += delta;
    opts?.onToken?.(delta); // stream tokens → "watch it think"
  }
  return acc;
}
