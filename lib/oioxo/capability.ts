/**
 * oioxo Compute Mesh — CAPABILITY AUTO-ASSIGNMENT (stage 4). Turns a device's measured
 * hardware (`hardware.ts`) + environment into the `Capability[]` it should advertise to
 * the fabric (`mesh.ts`). This is how "any device is a helper" becomes automatic: a
 * strong GPU box offers `generate`; a phone on battery quietly drops `generate` but
 * still offers `verify`/`embed`/`corpus`; a device that already cached the model offers
 * to `weights`-seed its siblings.
 *
 * Pure + Node-testable: callers pass a detected hardware summary + env flags; no DOM.
 */
import type { Tier } from './hardware';
import type { Capability, HelperProfile } from './mesh';

export interface DeviceEnv {
  /** Tauri desktop: real process exec — the strongest oracle + can host preview. */
  desktop?: boolean;
  /** Cross-origin-isolated browser: Node in a WASM sandbox (WebContainer) → run + preview. */
  webcontainer?: boolean;
  /** Model weights are cached locally → this device can seed them to LAN siblings. */
  hasModel?: boolean;
  /** The verified-brick corpus is present → can serve compose lookups. */
  hasCorpus?: boolean;
  /** On battery — discourage the heavy/drainy roles (generation) even if capable. */
  onBattery?: boolean;
}

export interface HardwareSummary {
  tier: Tier;
  /** WebGPU present — required to run a model fast enough to offer generation. */
  webgpu: boolean;
}

/**
 * Should this device offer to GENERATE for others? Only when it can do so WELL: a real
 * GPU (mid/high tier) and not draining a battery. A `none`/`low` device can still
 * generate for ITSELF via the slow WASM coder, but advertising it as a fabric helper
 * would make peers wait on weak silicon — so it doesn't.
 */
export function canGenerate(hw: HardwareSummary, env: DeviceEnv = {}): boolean {
  return hw.webgpu && (hw.tier === 'mid' || hw.tier === 'high') && !env.onBattery;
}

/**
 * The capabilities this device advertises. `verify`, `embed` and `corpus*` are
 * available from almost anything (type-check is universal, embeddings are light), so a
 * weak device is never useless — it just plays the cheap roles.
 *   *corpus requires actually HAVING the corpus; weights requires HAVING the model.
 */
export function capabilitiesFor(hw: HardwareSummary, env: DeviceEnv = {}): Capability[] {
  const caps: Capability[] = [];
  if (canGenerate(hw, env)) caps.push('generate');
  caps.push('verify'); // every device can at least type-check
  caps.push('embed');  // embeddings are light enough for any device
  if (env.hasCorpus) caps.push('corpus');
  if (env.hasModel) caps.push('weights');
  if (env.desktop || env.webcontainer) caps.push('preview');
  return caps;
}

/** The relative strength of this device's verify ORACLE (native > sandbox > types).
 *  Used by the verify pool to prefer the most authoritative verifier. */
export function oracleStrength(env: DeviceEnv = {}): number {
  if (env.desktop) return 3;        // real process exec — ground truth
  if (env.webcontainer) return 2;   // Node in a WASM sandbox
  return 1;                          // type-check only
}

/** Build the full profile this device registers with the fabric. */
export function profileFor(id: string, hw: HardwareSummary, env: DeviceEnv = {}, label?: string): HelperProfile {
  return { id, caps: capabilitiesFor(hw, env), tier: hw.tier, label };
}
