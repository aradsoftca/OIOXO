/**
 * oioxo Code — ON-DEVICE CONTINUAL LEARNING (Gem 4). Every verified red→green
 * repair is a perfect, human-label-free training pair (the oracle is the
 * annotator — see conductor.ts / trajectory-store.ts). This module is the learning
 * layer that turns those into a LoRA the conductor improves with, IN the browser
 * (WebGPU), idle/overnight — so the model adapts to THIS user's stack — and lets
 * devices POOL what they learned by exchanging tiny LoRA deltas over the same P2P
 * stack (federated averaging). The device compounds; trust still doesn't (a shared
 * delta is just weights — it changes proposals, never bypasses the oracle).
 *
 * The federated MERGE math, the job assembly, and the delta format are pure +
 * Node-tested here; the actual WebGPU trainer slots in behind `Trainer` (it's the
 * one piece that needs a GPU + an emerging training runtime, so it's an interface,
 * not faked).
 */
import type { ConductorExample } from './conductor';

/** A LoRA delta = a small set of low-rank weight updates, with the sample count it
 *  was trained on (the weight for federated averaging) and the base model id. */
export interface LoraDelta {
  base: string;
  /** How many verified examples produced this delta (FedAvg weight). */
  samples: number;
  /** Flattened low-rank tensors by name (e.g. "layer3.q.A"). Small by design. */
  tensors: Record<string, number[]>;
}

/**
 * FEDERATED AVERAGING: merge LoRA deltas from several devices into one, weighting
 * each by how many verified examples it learned from (more evidence → more pull).
 * Tensors present in only some deltas are still averaged over their contributors.
 * Mismatched shapes for the same tensor are skipped (never average garbage). Pure.
 */
export function mergeDeltas(deltas: LoraDelta[]): LoraDelta | null {
  const valid = deltas.filter((d) => d && d.samples > 0 && d.tensors);
  if (!valid.length) return null;
  const base = valid[0].base;
  const acc: Record<string, { sum: number[]; weight: number; len: number }> = {};
  for (const d of valid) {
    if (d.base !== base) continue; // never merge across different base models
    for (const [name, vec] of Object.entries(d.tensors)) {
      if (!Array.isArray(vec) || !vec.length) continue;
      const slot = acc[name] ?? (acc[name] = { sum: new Array(vec.length).fill(0), weight: 0, len: vec.length });
      if (vec.length !== slot.len) continue; // shape mismatch → skip this contribution
      for (let i = 0; i < vec.length; i++) slot.sum[i] += vec[i] * d.samples;
      slot.weight += d.samples;
    }
  }
  const tensors: Record<string, number[]> = {};
  for (const [name, s] of Object.entries(acc)) {
    if (s.weight > 0) tensors[name] = s.sum.map((v) => v / s.weight);
  }
  const samples = valid.filter((d) => d.base === base).reduce((n, d) => n + d.samples, 0);
  return { base, samples, tensors };
}

/** Apply a delta to a running adapter by scaling (e.g. trust a freshly-received
 *  federated delta less until it proves out locally). Pure helper. */
export function scaleDelta(delta: LoraDelta, factor: number): LoraDelta {
  const tensors: Record<string, number[]> = {};
  for (const [k, v] of Object.entries(delta.tensors)) tensors[k] = v.map((x) => x * factor);
  return { ...delta, tensors };
}

export interface LoraJob {
  base: string;
  examples: ConductorExample['messages'][];
  /** LoRA rank + epochs — small for a quick idle-time adaptation. */
  rank: number;
  epochs: number;
}

/**
 * Assemble a training job from the device's verified trajectory examples (the
 * oracle-labeled red→green fixes). Dedup-free here (the store already dedupes);
 * caps the set so an idle-time pass stays short. Pure.
 */
export function buildLoraJob(examples: ConductorExample[], opts: { base: string; rank?: number; epochs?: number; max?: number } ): LoraJob {
  const max = opts.max ?? 2000;
  return {
    base: opts.base,
    examples: examples.slice(0, max).map((e) => e.messages),
    rank: opts.rank ?? 8,
    epochs: opts.epochs ?? 1,
  };
}

/** The trainer contract. The WebGPU implementation (the one piece that needs a GPU
 *  + a training runtime) slots in here; everything around it is pure + tested. */
export interface Trainer {
  available(): Promise<boolean>;
  train(job: LoraJob, onProgress?: (p: number) => void): Promise<LoraDelta>;
}

/** Is in-browser LoRA training usable here? (WebGPU + enough memory.) The real
 *  check lives with the WebGPU trainer; this is the gate the UI reads. */
export async function webgpuTrainerAvailable(): Promise<boolean> {
  try {
    const gpu = (globalThis as unknown as { navigator?: { gpu?: { requestAdapter: () => Promise<unknown> } } }).navigator?.gpu;
    return !!gpu && !!(await gpu.requestAdapter());
  } catch { return false; }
}

/** Placeholder trainer: conforms to the interface and is HONEST that real training
 *  isn't wired yet (returns an empty delta = a no-op adapter). The federated merge,
 *  job assembly, and delta exchange are real and tested around it; swap this for the
 *  WebGPU trainer when the training runtime lands. */
export const StubTrainer: Trainer = {
  async available() { return false; },
  async train(job) { return { base: job.base, samples: 0, tensors: {} }; },
};
