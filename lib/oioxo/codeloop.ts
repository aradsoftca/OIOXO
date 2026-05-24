/**
 * oioxo Code — the execute→repair loop (OIOXO_CODE.md §2). The deterministic
 * heart of "the device proves it": a (small) model PROPOSES code; the device
 * RUNS it; the exact error feeds back; the model makes a MINIMAL fix; repeat
 * until green. Correctness comes from real execution, not the model's size.
 *
 * Pure orchestration: the generator (`GenerateFn`) and the runner (`RunFn`) are
 * injected, so the same loop drives the small WebGPU coder (browser tier) or a
 * big native coder (Tauri tier), and is fully unit-testable with fakes.
 */

export interface CodeFile {
  path: string;
  content: string;
}

/** Result of running the project (tests / build / script) on-device. */
export interface RunResult {
  /** Did it pass (tests green / build clean / exit 0)? — the ground truth. */
  ok: boolean;
  /** Full stdout+stderr (for display + the model's repair context). */
  output: string;
  /** The salient error text fed back to the model (compiler/test failures). */
  errors: string;
}

/** A proposed change: full content for a file path (created or replaced). */
export interface Edit {
  path: string;
  content: string;
}

export interface GenContext {
  task: string;
  files: CodeFile[];
  /** The error from the previous run, if this is a repair attempt. */
  error?: string;
  /** 0 = first draft, 1.. = repairs. */
  attempt: number;
}

export type GenerateFn = (ctx: GenContext) => Promise<Edit[]>;
export type RunFn = (files: CodeFile[], cmd: string) => Promise<RunResult>;

export interface LoopOptions {
  task: string;
  files: CodeFile[];
  /** Command whose pass/fail is the oracle (default "npm test"). */
  testCmd?: string;
  /** Max generate→run cycles before giving up (default 5). */
  maxIters?: number;
  generate: GenerateFn;
  run: RunFn;
  /** Progress hook (UI: show each attempt's result). */
  onStep?: (s: { attempt: number; ok: boolean; errors: string }) => void;
}

export interface LoopResult {
  ok: boolean;
  files: CodeFile[];
  iters: number;
  lastOutput: string;
  /** Per-attempt outcome, for the UI timeline. */
  history: { attempt: number; ok: boolean }[];
}

/** Apply full-file edits onto the working set (replace by path, or add new). */
export function applyEdits(files: CodeFile[], edits: Edit[]): CodeFile[] {
  const map = new Map(files.map((f) => [f.path, f.content]));
  for (const e of edits) if (e && e.path) map.set(e.path, e.content);
  return Array.from(map, ([path, content]) => ({ path, content }));
}

/**
 * Drive the loop. Each cycle: the model proposes edits (from the task, then from
 * the last error), we apply + run, and stop the instant the oracle says green.
 * Returns the final files + whether it succeeded — never throws (a thrown
 * generator/runner ends the cycle and the loop reports the last state).
 */
export async function runCodeLoop(opts: LoopOptions): Promise<LoopResult> {
  const cmd = opts.testCmd ?? 'npm test';
  const maxIters = Math.max(1, opts.maxIters ?? 5);
  let files = [...opts.files];
  let last: RunResult = { ok: false, output: '', errors: '' };
  const history: { attempt: number; ok: boolean }[] = [];

  for (let attempt = 0; attempt < maxIters; attempt++) {
    try {
      const edits = await opts.generate({
        task: opts.task,
        files,
        error: attempt === 0 ? undefined : last.errors,
        attempt,
      });
      if (edits?.length) files = applyEdits(files, edits);
      last = await opts.run(files, cmd);
    } catch (e) {
      last = { ok: false, output: String((e as Error)?.message || e), errors: String((e as Error)?.message || e) };
    }
    history.push({ attempt, ok: last.ok });
    opts.onStep?.({ attempt, ok: last.ok, errors: last.errors });
    if (last.ok) return { ok: true, files, iters: attempt + 1, lastOutput: last.output, history };
  }
  return { ok: false, files, iters: maxIters, lastOutput: last.output, history };
}

/**
 * Pull the salient error lines from raw run output for the model's repair
 * context — compiler/test failures, not the whole noisy log. Heuristic + general
 * (works across node/tsc/jest/vitest/python); the model gets signal, not noise.
 */
export function extractErrors(output: string, maxLines = 40): string {
  const lines = output.split('\n');
  const hits: string[] = [];
  const CUE = /\b(error|fail(ed|ing)?|exception|traceback|expected|received|assert|cannot find|is not|undefined|TypeError|SyntaxError|ReferenceError|TS\d{3,})\b/i;
  for (let i = 0; i < lines.length; i++) {
    if (CUE.test(lines[i])) {
      // keep the matching line + a little surrounding context
      for (let j = Math.max(0, i - 1); j <= Math.min(lines.length - 1, i + 2); j++) {
        if (!hits.includes(lines[j])) hits.push(lines[j]);
      }
    }
    if (hits.length >= maxLines) break;
  }
  return (hits.length ? hits : lines.slice(-maxLines)).join('\n').slice(0, 3000);
}
