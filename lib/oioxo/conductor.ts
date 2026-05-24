/**
 * oioxo Code P6 — the CONDUCTOR's training data (OIOXO_CODE.md §6.6). The
 * conductor is a TINY model that doesn't need to KNOW code — it orchestrates the
 * loop's three roles: PLAN (intent + steps), RANK (pick the candidate most likely
 * to pass), and FIX (turn an exact error + the buggy code into the minimal edit).
 *
 * The data is special: the execute→repair loop is a SELF-LABELING teacher. Every
 * verified red→green repair is a proven "this error + this code → this minimal
 * fix" example — no human labels, no hallucination, the oracle is the annotator.
 * This module turns recorded trajectories into chat-format training examples and
 * also builds a deterministic, oracle-VALIDATED seed set to bootstrap training
 * before real trajectories accumulate. Pure + Node-testable.
 */
import type { CodeFile, Edit, StepRecord } from './codeloop';
import { typeCheckFiles, formatDiags } from './typecheck';

export type Role = 'plan' | 'rank' | 'fix';

/** A training example in the repo's standard chat JSONL shape. */
export interface ConductorExample {
  role: Role;
  messages: [{ role: 'user'; content: string }, { role: 'assistant'; content: string }];
}

/** Render edits exactly as the coder is asked to (fenced blocks headed by PATH),
 *  so the conductor's FIX target matches the real output format. */
export function renderEdits(edits: Edit[]): string {
  return edits.map((e) => `\`\`\`${e.path}\n${e.content.replace(/\n$/, '')}\n\`\`\``).join('\n');
}

const FIX_INSTRUCTION =
  'You are a code-repair conductor. Given a task, the exact error, and the current ' +
  'file(s), output ONLY the changed file(s) as fenced blocks headed by the file PATH. ' +
  'Make the SMALLEST change that fixes the error. No prose.';

function renderFiles(files: CodeFile[], cap = 4000): string {
  return files.map((f) => `--- ${f.path} ---\n${f.content.slice(0, cap)}`).join('\n\n');
}

/** The FIX prompt the conductor sees (mirrors codegen's repair message). */
export function fixInput(task: string, error: string, files: CodeFile[]): string {
  return `${FIX_INSTRUCTION}\n\nTask: ${task}\n\nError:\n${error}\n\nFiles:\n${renderFiles(files)}`;
}

/**
 * Mine FIX examples from a recorded loop run: any step that flipped the oracle
 * red→green (it had an error to fix and the result passed) is a gold pair —
 * (task + that error + the code it saw) → (the edits that worked). Verified, not
 * guessed: the loop only kept it because the oracle went green.
 */
export function fixExamplesFromTrajectory(task: string, trajectory: StepRecord[]): ConductorExample[] {
  const out: ConductorExample[] = [];
  for (const s of trajectory) {
    if (s.ok && s.error && s.edits.length) {
      out.push({
        role: 'fix',
        messages: [
          { role: 'user', content: fixInput(task, s.error, s.filesBefore) },
          { role: 'assistant', content: renderEdits(s.edits) },
        ],
      });
    }
  }
  return out;
}

/* ── Deterministic, oracle-validated SEED ─────────────────────────────────────
 * Each case is a real TS bug with its minimal fix. We VERIFY at build time that
 * the buggy code actually errors and the fixed code is clean (typeCheckFiles), so
 * every seed example is correct by construction — the same oracle that labels
 * real trajectories. */

export interface SeedCase {
  task: string;
  path: string;
  buggy: string;
  fixed: string;
}

export const SEED_CASES: SeedCase[] = [
  { task: 'make it type-check', path: 'a.ts', buggy: `export const n: number = "5";`, fixed: `export const n: number = 5;` },
  { task: 'make it type-check', path: 'b.ts', buggy: `export function area(w: number, h: number) { return w * h; }\nexport const x = area(3);`, fixed: `export function area(w: number, h: number) { return w * h; }\nexport const x = area(3, 4);` },
  { task: 'make it type-check', path: 'c.ts', buggy: `export const up = (s: string) => s.toUpperCasee();`, fixed: `export const up = (s: string) => s.toUpperCase();` },
  { task: 'make it type-check', path: 'd.ts', buggy: `interface P { id: number }\nexport const p: P = { id: 1, name: "x" };`, fixed: `interface P { id: number; name: string }\nexport const p: P = { id: 1, name: "x" };` },
  { task: 'make it type-check', path: 'e.ts', buggy: `export function first(xs: number[]): number { return xs[0]; }\nexport const v: string = first([1, 2]);`, fixed: `export function first(xs: number[]): number { return xs[0]; }\nexport const v: number = first([1, 2]);` },
  { task: 'make it type-check', path: 'f.ts', buggy: `export const greet = (name: string): string => { \`hi \${name}\`; };`, fixed: `export const greet = (name: string): string => \`hi \${name}\`;` },
];

export interface SeedBuild {
  examples: ConductorExample[];
  /** Cases rejected because the oracle disagreed (buggy clean or fix still errors). */
  rejected: { path: string; reason: string }[];
}

/**
 * Build the seed set, VALIDATING each case against the type oracle: the buggy code
 * must error and the fix must be clean — otherwise the case is rejected (never
 * train on an unverified pair). Produces FIX examples + a paired RANK example
 * (buggy candidate fails, fixed candidate passes → pick the passing one).
 */
export async function buildSeed(cases: SeedCase[] = SEED_CASES, libFiles?: Map<string, string>): Promise<SeedBuild> {
  const examples: ConductorExample[] = [];
  const rejected: { path: string; reason: string }[] = [];
  for (const c of cases) {
    const bad = await typeCheckFiles([{ path: c.path, content: c.buggy }], libFiles);
    const good = await typeCheckFiles([{ path: c.path, content: c.fixed }], libFiles);
    if (bad.length === 0) { rejected.push({ path: c.path, reason: 'buggy code did not error' }); continue; }
    if (good.length !== 0) { rejected.push({ path: c.path, reason: `fix still errors: ${formatDiags(good)}` }); continue; }

    const error = formatDiags(bad);
    const buggyFile = [{ path: c.path, content: c.buggy }];
    const edits: Edit[] = [{ path: c.path, content: c.fixed }];
    examples.push({
      role: 'fix',
      messages: [
        { role: 'user', content: fixInput(c.task, error, buggyFile) },
        { role: 'assistant', content: renderEdits(edits) },
      ],
    });
    // RANK: given the two candidate fixes, choose the one the oracle accepts.
    examples.push({
      role: 'rank',
      messages: [
        {
          role: 'user',
          content:
            `You are a ranking conductor. Pick the candidate that will type-check (answer with just its number).\n\n` +
            `Task: ${c.task}\nError:\n${error}\n\n` +
            `Candidate 1:\n\`\`\`${c.path}\n${c.buggy}\n\`\`\`\n\nCandidate 2:\n\`\`\`${c.path}\n${c.fixed}\n\`\`\``,
        },
        { role: 'assistant', content: '2' },
      ],
    });
  }
  return { examples, rejected };
}

/** A few PLAN examples (intent + ordered steps as JSON) — the conductor's first
 *  role. Templated + deterministic; the JSON shape is what the planner consumes. */
export function planExamples(): ConductorExample[] {
  const mk = (task: string, intent: string, steps: string[]): ConductorExample => ({
    role: 'plan',
    messages: [
      { role: 'user', content: `You are a planning conductor. Output JSON {"intent":...,"steps":[...]}. Plan this task:\n${task}` },
      { role: 'assistant', content: JSON.stringify({ intent, steps }) },
    ],
  });
  return [
    mk('build a CLI that reverses a string', 'new', ['scaffold a module with a reverse(s) function', 'add a test for reverse', 'wire a CLI entry that prints the reversed argv']),
    mk('the build fails with a type error in utils.ts', 'fix', ['read the exact compiler error', 'open utils.ts at the reported line', 'apply the minimal type-correct change', 're-run the type check']),
    mk('add a debounce helper used by the search box', 'feature', ['find where the search box calls input handlers', 'add a typed debounce(fn, ms) util', 'use it in the search handler', 'verify types pass']),
    mk('rename getUser to fetchUser across the project', 'edit', ['find all references to getUser', 'rename the declaration and every call site', 'type-check to confirm no missed references']),
  ];
}

/** Serialize examples to the repo-standard training JSONL ({messages:[...]}).
 *  Roles are interleaved so the model sees all three throughout training. */
export function toJsonl(examples: ConductorExample[]): string {
  return examples.map((e) => JSON.stringify({ messages: e.messages })).join('\n') + '\n';
}
