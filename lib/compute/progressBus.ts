/**
 * Tiny global progress bus. Worker-backed operations (audio encode, image codec)
 * publish here; a single <GlobalProgress> in the shell renders it. This gives
 * every off-thread job a visible progress indicator without per-tool UI code.
 */

export interface ProgressState { active: boolean; phase: string; ratio: number }

let state: ProgressState = { active: false, phase: '', ratio: 0 };
let activeJobs = 0;
const listeners = new Set<(s: ProgressState) => void>();

function emit() { for (const l of listeners) l(state); }

export function subscribeProgress(l: (s: ProgressState) => void): () => void {
  listeners.add(l);
  l(state);
  return () => { listeners.delete(l); };
}

export function startJob(phase = 'Working'): void {
  activeJobs++;
  state = { active: true, phase, ratio: 0 };
  emit();
}

export function updateJob(phase: string, ratio: number): void {
  if (!activeJobs) return;
  state = { active: true, phase, ratio: Math.max(0, Math.min(1, ratio)) };
  emit();
}

export function endJob(): void {
  activeJobs = Math.max(0, activeJobs - 1);
  if (activeJobs === 0) state = { active: false, phase: '', ratio: 0 };
  emit();
}
