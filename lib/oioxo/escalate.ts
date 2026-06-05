/**
 * oioxo Code — AUTOMATIC MODEL ESCALATION (roadmap #3). "Runs on any device" +
 * "handles hard projects" are reconciled by SIZING the coder to the moment: the
 * tiny on-device model handles the verifiable majority; the hardest ~5% (large or
 * stuck builds) transparently escalate to a bigger local model, the user's own
 * frontier key, or a peer's compute — only when needed, never by default.
 *
 * This is the pure decision policy (Node-testable). The actual model loading lives
 * in runtime.ts / codebuild's `coder` option; this just chooses which to use.
 */

export type HardwareTier = 'none' | 'low' | 'mid' | 'high';
export type CoderTier = 'wasm' | 'webgpu-small' | 'local-big' | 'frontier' | 'distributed';

export interface EscalationSignals {
  /** From hardware.ts (WebGPU + memory). */
  hardware: HardwareTier;
  /** Adaptive-search stuck count (same error repeating). 0 = fine. */
  stuck?: number;
  /** Is this a large/long-horizon project (plan-project.isLargeProject)? */
  large?: boolean;
  /** The user pasted a frontier API key (BYOK) — the strongest writer. */
  hasFrontierKey?: boolean;
  /** A bigger local model is installed (Tauri/ollama tier). */
  hasLocalBig?: boolean;
  /** A peer is connected to lend inference/verification (Gem 5). */
  hasPeer?: boolean;
}

export interface CoderChoice {
  tier: CoderTier;
  reason: string;
}

/** The baseline coder for the device, before any escalation. */
function baseTier(hw: HardwareTier): CoderTier {
  return hw === 'none' || hw === 'low' ? 'wasm' : 'webgpu-small';
}

/**
 * Choose the coder for this turn. Start from the hardware baseline; escalate only
 * when the work warrants it (stuck, or a large project), preferring the strongest
 * AVAILABLE option (frontier key > bigger local > peer) and otherwise staying put.
 */
export function chooseCoder(s: EscalationSignals): CoderChoice {
  const stuck = s.stuck ?? 0;
  const base = baseTier(s.hardware);

  // The hardest cases: badly stuck, or a large project that's also struggling.
  const needsMore = stuck >= 2 || (s.large === true && stuck >= 1);
  if (needsMore) {
    if (s.hasFrontierKey) return { tier: 'frontier', reason: `stuck ${stuck}× — escalating to your frontier key for the hard part` };
    if (s.hasLocalBig) return { tier: 'local-big', reason: `stuck ${stuck}× — escalating to the bigger local model` };
    if (s.hasPeer) return { tier: 'distributed', reason: `stuck ${stuck}× — borrowing a connected peer's compute` };
    // No stronger option available — stay on base but the loop keeps searching wider.
    return { tier: base, reason: `stuck ${stuck}× but no stronger tier available — searching wider on-device` };
  }

  // A large project on a capable device: prefer a bigger local model if present.
  if (s.large && (s.hardware === 'high') && s.hasLocalBig) {
    return { tier: 'local-big', reason: 'large project on capable hardware — using the bigger local model' };
  }

  return { tier: base, reason: base === 'wasm' ? 'weak/no GPU — CPU/WASM coder' : 'on-device WebGPU coder' };
}

/** Should the heavy VERIFY (tests/build) be offloaded to a peer? (Gem 5.) Weak
 *  device + a connected peer = let the peer judge while this device drives. */
export function shouldOffloadOracle(s: EscalationSignals): boolean {
  return !!s.hasPeer && (s.hardware === 'none' || s.hardware === 'low');
}

/* ── "ANY DEVICE" strategy: source GENERATION the cheapest reliable way ──────── */

export type CodeSource = 'replay' | 'compose' | 'webgpu' | 'peer' | 'server' | 'frontier' | 'wasm';

export interface DeviceSignals extends EscalationSignals {
  /** A server inference endpoint (e.g. the Iceland GPU) is configured. */
  hasServer?: boolean;
}

/**
 * The ordered list of code SOURCES to try for this device. The whole point for a
 * no-WebGPU device: lean on ZERO/CHEAP-inference sources first (replay a solved
 * goal, compose from verified bricks), then BORROW inference (peer GPU, server,
 * frontier), and only fall back to the slow local WASM model last. A capable
 * (WebGPU) device just uses its on-device coder. Deterministic + Node-testable.
 */
export function codeSources(s: DeviceSignals): CodeSource[] {
  const out: CodeSource[] = ['replay', 'compose']; // free, work on any device
  const capable = s.hardware === 'high' || s.hardware === 'mid';
  if (capable) out.push('webgpu');
  // Borrowed inference, strongest available first (only matters for the novel delta).
  if (s.hasFrontierKey) out.push('frontier');
  if (s.hasPeer) out.push('peer');
  if (s.hasServer) out.push('server');
  // Last resort on a weak device with nothing borrowed: the slow CPU/WASM model.
  if (!capable) out.push('wasm');
  return out;
}

export interface LoopProfile {
  maxIters: number;
  candidates: number;
  maxCandidates: number;
  /** Prefer reusing verified bricks over authoring (weak models can't author). */
  bricksHeavy: boolean;
  /** Cap files shipped to a remote/weak generator to keep latency sane. */
  maxFiles: number;
}

/**
 * Loop tuning for the device. A weak/CPU device gets MORE iterations + wider
 * adaptive search (each step is a cheap patch, so iterating is the lever) and
 * leans hard on bricks; a capable device runs lean. A remote/borrowed coder is
 * strong, so it needs few iterations.
 */
export function loopProfile(s: DeviceSignals, source: CodeSource): LoopProfile {
  if (source === 'frontier' || source === 'server' || source === 'peer') {
    return { maxIters: 4, candidates: 1, maxCandidates: 2, bricksHeavy: false, maxFiles: 40 };
  }
  if (source === 'webgpu') {
    return { maxIters: 5, candidates: 2, maxCandidates: 4, bricksHeavy: true, maxFiles: 40 };
  }
  // wasm / weakest local: more iterations of cheap patches, brick-first, fewer files.
  return { maxIters: 8, candidates: 1, maxCandidates: 3, bricksHeavy: true, maxFiles: 12 };
}
