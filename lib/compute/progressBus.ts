/**
 * Tiny global progress bus. Worker-backed operations (audio encode, image codec)
 * publish here; a single <GlobalProgress> in the shell renders it. This gives
 * every off-thread job a visible progress indicator without per-tool UI code.
 */

export interface ProgressState { active: boolean; phase: string; ratio: number }

// A stack of in-flight jobs. The bus surfaces the top of stack so a nested
// job (e.g. ffmpeg starting while an audio encode is finishing) shows its
// own progress and the earlier job is restored when the nested one ends.
// Previously a single mutable `state` clobbered earlier jobs on start, and
// endJob just blanked it — so the user saw the bar flash between phases.
interface Job { phase: string; ratio: number }
const stack: Job[] = [];
let lastEmitted: ProgressState = { active: false, phase: '', ratio: 0 };
const listeners = new Set<(s: ProgressState) => void>();

function currentState(): ProgressState {
  const top = stack[stack.length - 1];
  return top
    ? { active: true, phase: top.phase, ratio: top.ratio }
    : { active: false, phase: '', ratio: 0 };
}

function emit() {
  lastEmitted = currentState();
  for (const l of listeners) l(lastEmitted);
}

export function subscribeProgress(l: (s: ProgressState) => void): () => void {
  listeners.add(l);
  l(lastEmitted);
  return () => { listeners.delete(l); };
}

export function startJob(phase = 'Working'): void {
  stack.push({ phase, ratio: 0 });
  emit();
}

export function updateJob(phase: string, ratio: number): void {
  const top = stack[stack.length - 1];
  if (!top) return;
  top.phase = phase;
  top.ratio = Math.max(0, Math.min(1, ratio));
  emit();
}

export function endJob(): void {
  if (stack.length) stack.pop();
  emit();
}
