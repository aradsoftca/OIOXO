/**
 * oioxo Code — TRAJECTORY REPLAY / agent memoization (the weak-device magic,
 * lever/Gem 3). Bricks cache functions; this caches whole SOLVED GOALS. Every
 * build that reaches green is a verified (goal → working project). When a new
 * request is close to a past one, we REPLAY that project instead of re-running the
 * model: verify it as-is (often still green → zero model calls, ~instant), or use
 * it as a WARM START so the loop begins next-to-green instead of from nothing.
 *
 * "Build me a todo app" goes from a 2-minute model session to a 2-second
 * replay-and-adapt — and the cache is shareable P2P like the brick corpus, so the
 * network memoizes the agent itself. Pure + Node-testable; persistence
 * (solution-store.ts) mirrors brick-store.ts / trajectory-store.ts.
 */
import { overlapScore } from './trajectory-store';
import type { CodeFile, RunResult } from './codeloop';

export interface Solution {
  id: string;
  /** The goal text that produced this verified project (the retrieval key). */
  goal: string;
  /** The full verified project files (the build that reached green). */
  files: CodeFile[];
  /** How to verify/run it again (so a replay re-checks under the right oracle). */
  runtime?: 'node' | 'python' | 'sql';
  testCmd?: string;
  /** How many model calls the original solve cost (telemetry: replay saves these). */
  cost?: number;
  ts: number;
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();

/** Stable id from the NORMALIZED goal, so re-solving the same goal updates the one
 *  cached solution instead of piling up near-duplicates. */
export function solutionId(goal: string): string {
  const s = norm(goal);
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return 'sol_' + (h >>> 0).toString(36);
}

export function makeSolution(goal: string, files: CodeFile[], meta: Partial<Solution> = {}): Solution {
  return { id: solutionId(goal), goal, files, runtime: meta.runtime, testCmd: meta.testCmd, cost: meta.cost, ts: meta.ts ?? Date.now() };
}

/** The closest cached solution to a goal, above a similarity floor. The floor is
 *  HIGH (replaying the wrong project is costly): an exact/near match replays, a
 *  loose match warm-starts, nothing below the floor. */
export function matchSolution(goal: string, solutions: Solution[], min = 0.5): { solution: Solution; score: number } | null {
  let best: { solution: Solution; score: number } | null = null;
  for (const s of solutions) {
    const score = norm(s.goal) === norm(goal) ? 1 : overlapScore(goal, s.goal);
    if (score >= min && (!best || score > best.score)) best = { solution: s, score };
  }
  return best;
}

export type ReplayMode = 'exact' | 'warm' | 'none';

/** How should a recalled solution be used for this goal?
 *  - exact (≥0.9): replay the project and just re-verify — likely 0 model calls.
 *  - warm  (≥floor): start the build FROM these files (next-to-green, not blank).
 *  - none: build from scratch. */
export function replayMode(score: number): ReplayMode {
  if (score >= 0.9) return 'exact';
  if (score >= 0.5) return 'warm';
  return 'none';
}

export interface ReplayOutcome {
  files: CodeFile[];
  ok: boolean;
  /** Replayed a cached solution and it verified as-is → no model was run. */
  replayed: boolean;
  /** Started the build from a cached solution instead of scratch. */
  warmStarted: boolean;
  modelCalls: number;
  iters: number;
}

/**
 * Replay-or-build (pure orchestration; deps injected so it's Node-testable):
 *  1. recall the closest solution for the goal,
 *  2. EXACT match → verify it as-is; green → done with ZERO model calls,
 *  3. else WARM start the build from the cached files (closer to green),
 *  4. no match → build from scratch.
 * `verify` is the oracle (RunFn-like); `build` is the normal generate→repair loop,
 * taking the starting files and returning the result + how many model calls it used.
 */
export async function replayOrBuild(opts: {
  goal: string;
  scratchFiles: CodeFile[];
  recall: (goal: string) => Promise<{ solution: Solution; score: number } | null>;
  verify: (files: CodeFile[]) => Promise<RunResult>;
  build: (startFiles: CodeFile[]) => Promise<{ files: CodeFile[]; ok: boolean; iters: number; modelCalls: number }>;
  onNote?: (s: string) => void;
}): Promise<ReplayOutcome> {
  const hit = await opts.recall(opts.goal).catch(() => null);
  const mode = hit ? replayMode(hit.score) : 'none';

  if (hit && mode === 'exact') {
    opts.onNote?.(`\n· seen this before — replaying a verified solution…\n`);
    const res = await opts.verify(hit.solution.files).catch(() => ({ ok: false, output: '', errors: 'verify failed' }));
    if (res.ok) {
      opts.onNote?.(`✓ replayed instantly (no model run)\n`);
      return { files: hit.solution.files, ok: true, replayed: true, warmStarted: false, modelCalls: 0, iters: 0 };
    }
    // The cached project no longer verifies (env changed) → fall through to warm start.
  }

  if (hit && (mode === 'warm' || mode === 'exact')) {
    opts.onNote?.(`\n· similar to a past build — warm-starting from it\n`);
    const r = await opts.build(hit.solution.files);
    return { files: r.files, ok: r.ok, replayed: false, warmStarted: true, modelCalls: r.modelCalls, iters: r.iters };
  }

  const r = await opts.build(opts.scratchFiles);
  return { files: r.files, ok: r.ok, replayed: false, warmStarted: false, modelCalls: r.modelCalls, iters: r.iters };
}
