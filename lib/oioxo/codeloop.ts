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
  /** Verification-guided best-of-N: per attempt, draft this many candidates and
   *  keep the one the ORACLE likes best (passing, else fewest errors). >1 trades
   *  model calls for correctness — the deterministic form of the conductor's RANK
   *  role. Default 1 (single draft, unchanged behavior). */
  candidates?: number;
  generate: GenerateFn;
  run: RunFn;
  /** Progress hook (UI: show each attempt's result). */
  onStep?: (s: { attempt: number; ok: boolean; errors: string }) => void;
  /** P6: capture each attempt (context in, edits out, oracle verdict) so verified
   *  red→green repairs become gold conductor training data. Off by default. */
  record?: boolean;
  /** Cancel the loop (the user's Stop). Checked between candidates/attempts; the
   *  loop ends gracefully and returns the best state so far. */
  signal?: AbortSignal;
  /** SEARCH-WHEN-STUCK (OIOXO_CODE §2 step 2): once repairs keep failing on the
   *  same error, look it up on the web and fold the findings into the next repair
   *  context — the small model resolves problems it doesn't know. */
  search?: (query: string) => Promise<string>;
  /** Start searching after this many failed attempts on the same error (default 2). */
  searchAfter?: number;
  /** Human narration of what the loop is doing (drives the "watch it think" view). */
  onNote?: (s: string) => void;
}

/** One generate→run attempt, captured for conductor distillation (P6). The loop
 *  is a self-labeling teacher: a step whose oracle flipped red→green is a proven
 *  "this error + this code → this minimal fix" example, no human labels. */
export interface StepRecord {
  attempt: number;
  /** The error the model was repairing (undefined on the first draft). */
  error?: string;
  /** Working set the generator saw THIS attempt (before applying its edits). */
  filesBefore: CodeFile[];
  /** Edits the model proposed this attempt. */
  edits: Edit[];
  /** Oracle verdict after applying the edits. */
  ok: boolean;
}

export interface LoopResult {
  ok: boolean;
  files: CodeFile[];
  iters: number;
  lastOutput: string;
  /** Per-attempt outcome, for the UI timeline. */
  history: { attempt: number; ok: boolean }[];
  /** Full per-attempt capture when `record` is set (P6 training data). */
  trajectory?: StepRecord[];
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
/** Is run result `a` better than `b`? Passing beats failing; among failures,
 *  fewer error characters wins (a rough "closer to green" proxy). */
function better(a: RunResult, b: RunResult | null): boolean {
  if (!b) return true;
  if (a.ok !== b.ok) return a.ok;
  return a.errors.length < b.errors.length;
}

export async function runCodeLoop(opts: LoopOptions): Promise<LoopResult> {
  const cmd = opts.testCmd ?? 'npm test';
  const maxIters = Math.max(1, opts.maxIters ?? 5);
  const nCand = Math.max(1, opts.candidates ?? 1);
  let files = [...opts.files];
  let last: RunResult = { ok: false, output: '', errors: '' };
  const history: { attempt: number; ok: boolean }[] = [];
  const trajectory: StepRecord[] | undefined = opts.record ? [] : undefined;
  const searchAfter = opts.searchAfter ?? 2;
  const searched = new Set<string>();

  for (let attempt = 0; attempt < maxIters; attempt++) {
    if (opts.signal?.aborted) { opts.onNote?.('\n■ stopped\n'); break; }
    const filesBefore = files;
    let error = attempt === 0 ? undefined : last.errors;
    // Stuck on the same error? Search the web and fold the findings into the repair.
    if (error && opts.search && attempt >= searchAfter) {
      const key = error.slice(0, 120);
      if (!searched.has(key)) {
        searched.add(key);
        const hint = await opts.search(error).catch(() => '');
        if (hint) error = `${error}\n\n[Web research for this problem]\n${hint}`;
      }
    }
    // Draft up to nCand candidates from the SAME starting point; the oracle ranks
    // them and we keep the best. Stop early the instant one passes.
    let bestFiles = filesBefore;
    let bestEdits: Edit[] = [];
    let bestRes: RunResult | null = null;
    for (let k = 0; k < nCand; k++) {
      if (opts.signal?.aborted) break;
      let cand = filesBefore;
      let edits: Edit[] = [];
      let res: RunResult;
      try {
        edits = (await opts.generate({ task: opts.task, files: filesBefore, error, attempt })) ?? [];
        cand = edits.length ? applyEdits(filesBefore, edits) : filesBefore;
        res = await opts.run(cand, cmd);
      } catch (e) {
        res = { ok: false, output: String((e as Error)?.message || e), errors: String((e as Error)?.message || e) };
      }
      if (better(res, bestRes)) { bestRes = res; bestFiles = cand; bestEdits = edits; }
      if (res.ok) break;
    }
    files = bestFiles;
    last = bestRes ?? last;
    history.push({ attempt, ok: last.ok });
    trajectory?.push({ attempt, error, filesBefore, edits: bestEdits, ok: last.ok });
    opts.onStep?.({ attempt, ok: last.ok, errors: last.errors });
    if (last.ok) return { ok: true, files, iters: attempt + 1, lastOutput: last.output, history, trajectory };
  }
  return { ok: false, files, iters: maxIters, lastOutput: last.output, history, trajectory };
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
