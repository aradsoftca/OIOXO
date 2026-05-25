/**
 * oioxo Agentic IDE (AGENTIC_IDE.md §5) — the ORCHESTRATOR. A frontier coding
 * agent doesn't dump one blob; it makes a PLAN, then works it step by step,
 * verifying as it goes and narrating. This is that loop, kept pure: the model
 * (planner) and the verified builder are INJECTED, so it's Node-testable with
 * fakes and reuses the same execute→repair loop the rest of oioxo trusts.
 *
 * The model proposes WHAT to do (the plan); the deterministic builder proves
 * each step compiles/passes on-device. Intelligence chooses, the device checks.
 */
import type { CodeFile } from './codeloop';

export interface PlanStep {
  /** Short label for the UI checklist. */
  title: string;
  /** The concrete instruction handed to the verified builder for this step. */
  task: string;
}

/** Produce an ordered plan from the goal + current files. */
export type PlanFn = (goal: string, files: CodeFile[]) => Promise<PlanStep[]>;

/** Context handed to each build step so the coder keeps the big picture (a
 *  frontier agent never loses sight of the goal or where it is in the plan). */
export interface StepContext {
  goal: string;
  index: number;
  total: number;
  steps: PlanStep[];
}

/** Build/verify one step against the working files; returns the new files.
 *  `engineError` signals the on-device model itself failed (GPU/load) — the agent
 *  stops rather than grinding through more steps that can't produce code. */
export type BuildStepFn = (
  task: string,
  files: CodeFile[],
  ctx: StepContext,
) => Promise<{ files: CodeFile[]; ok: boolean; iters: number; engineError?: string }>;

export type AgentEvent =
  | { type: 'plan'; steps: PlanStep[] }
  | { type: 'step-start'; index: number; step: PlanStep }
  | { type: 'step-done'; index: number; ok: boolean; iters: number; changed: string[] }
  | { type: 'files'; files: CodeFile[] }
  | { type: 'done'; ok: boolean; completed: number; total: number; engineError?: string };

export interface AgentOptions {
  goal: string;
  files: CodeFile[];
  plan: PlanFn;
  build: BuildStepFn;
  /** Cap the plan length (a tiny model shouldn't over-decompose). Default 6. */
  maxSteps?: number;
  /** Keep going to the next step even if one didn't fully verify. Default true —
   *  a frontier agent makes forward progress and revisits, it doesn't hard-stop. */
  continueOnFail?: boolean;
  /** Cancel (the user's Stop) — checked before each step. */
  signal?: AbortSignal;
}

/**
 * Drive the agent. Yields events for the UI (plan, per-step start/finish, the
 * growing file set) and returns the final files. Never throws: a failing planner
 * degrades to a single "build it" step; a failing build step is reported and
 * (by default) the loop moves on.
 */
export async function* runAgent(
  opts: AgentOptions,
): AsyncGenerator<AgentEvent, { files: CodeFile[]; ok: boolean }, void> {
  const maxSteps = Math.max(1, opts.maxSteps ?? 6);
  const continueOnFail = opts.continueOnFail !== false;
  let files = [...opts.files];

  let steps: PlanStep[] = [];
  try {
    steps = (await opts.plan(opts.goal, files)).slice(0, maxSteps);
  } catch {
    steps = [];
  }
  if (!steps.length) steps = [{ title: 'Build it', task: opts.goal }];
  yield { type: 'plan', steps };

  let completed = 0;
  let engineError: string | undefined;
  for (let i = 0; i < steps.length; i++) {
    if (opts.signal?.aborted) break; // user pressed Stop
    const step = steps[i];
    yield { type: 'step-start', index: i, step };
    const before = new Map(files.map((f) => [f.path, f.content]));
    let ok = false;
    let iters = 0;
    let changed: string[] = [];
    try {
      const res = await opts.build(step.task, files, { goal: opts.goal, index: i, total: steps.length, steps });
      files = res.files;
      ok = res.ok;
      iters = res.iters;
      changed = files.filter((f) => before.get(f.path) !== f.content).map((f) => f.path);
      if (res.engineError) engineError = res.engineError;
    } catch {
      ok = false;
    }
    if (ok) completed++;
    yield { type: 'step-done', index: i, ok, iters, changed };
    yield { type: 'files', files };
    if (engineError) break;            // the model died — stop, don't grind on
    if (!ok && !continueOnFail) break;
  }

  const allOk = completed === steps.length && !engineError;
  yield { type: 'done', ok: allOk, completed, total: steps.length, engineError };
  return { files, ok: allOk };
}

/**
 * Parse a plan out of a model's free-text reply. Robust + general: prefers a JSON
 * array (of strings or {title,task} objects), else falls back to numbered /
 * bulleted lines. Blank → empty (caller degrades to a single step).
 */
export function parsePlan(text: string): PlanStep[] {
  const fromObj = (o: unknown): PlanStep | null => {
    if (typeof o === 'string') {
      const t = o.trim();
      return t ? { title: clip(t), task: t } : null;
    }
    if (o && typeof o === 'object') {
      const r = o as Record<string, unknown>;
      const task = String(r.task ?? r.step ?? r.title ?? r.description ?? '').trim();
      if (!task) return null;
      const title = String(r.title ?? r.step ?? task).trim();
      return { title: clip(title), task };
    }
    return null;
  };

  // 1) Try a JSON array anywhere in the reply (handles ```json fences too).
  const arr = text.match(/\[[\s\S]*\]/);
  if (arr) {
    try {
      const parsed = JSON.parse(arr[0]);
      if (Array.isArray(parsed)) {
        const steps = parsed.map(fromObj).filter((s): s is PlanStep => !!s);
        if (steps.length) return steps;
      }
    } catch {
      /* fall through to line parsing */
    }
  }

  // 2) Numbered / bulleted lines.
  const steps: PlanStep[] = [];
  for (const raw of text.split('\n')) {
    const m = raw.match(/^\s*(?:\d+[.)]|[-*•])\s+(.*\S)/);
    if (m) {
      const t = m[1].replace(/\*\*/g, '').trim();
      if (t) steps.push({ title: clip(t), task: t });
    }
  }
  return steps;
}

const clip = (s: string, n = 64) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
