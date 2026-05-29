/**
 * oioxo Code — high-level entry that composes the loop end-to-end: the on-device
 * coder (generator) + the WebContainer oracle (runner) → generate→run→repair→
 * green. This is what the workspace UI calls. (OIOXO_CODE.md P1.)
 */
import { runCodeLoop, type CodeFile, type GenerateFn, type LoopResult, type RunFn, type RunResult } from './codeloop';
import { makeCoderGenerate } from './codegen';
import { makeWebContainerRun, runSupported } from './coderun';
import { typeCheckFiles, formatDiags, makeTypeCheckRun } from './typecheck';
import { grabForErrors } from './grab';
import { makeNativeRun } from './nativerun';
import { makeOllamaGenerate } from './bigcoder';
import { makeOioxoWebGenerate } from './oioxo-coder-web';
import { isDesktop } from './native';
import { makePythonRun } from './pyodide';
import { makeSqlRun } from './sqljs';
import { makeFrontierGenerate } from './frontier';
import { recallBricks, rememberVerifiedBuild } from './brick-store';
import { rememberSolution, recallSolution } from './solution-store';
import { RegressionGuard, makeRegressionRun } from './regression';
import { replayOrBuild, type ReplayOutcome } from './solutions';

export { runSupported };
export type { CodeFile, LoopResult };

export interface BuildOptions {
  /** Natural-language task: "implement X to pass the tests", "fix this error". */
  task: string;
  /** Current project files (from the opened folder). */
  files: CodeFile[];
  /** The command whose pass/fail is the oracle (default "npm test"). */
  testCmd?: string;
  /** web-llm model match for the installed coder (defaults to Qwen2.5-Coder). */
  match?: string[];
  /** Oracle: 'test' runs the suite in WebContainer (default); 'typecheck' uses
   *  the fast in-browser TS compiler (no install, no cross-origin isolation). */
  mode?: 'test' | 'typecheck';
  /** Browser TS lib snapshots for 'typecheck' mode (Node uses ts.sys). */
  libFiles?: Map<string, string>;
  /** Max generate→run cycles (default 5). */
  maxIters?: number;
  /** Live run log. */
  onData?: (chunk: string) => void;
  /** Model download/init progress (0..1). */
  onProgress?: (p: number) => void;
  /** Per-attempt outcome for the UI timeline. */
  onStep?: (s: { attempt: number; ok: boolean; errors: string }) => void;
  /** P4: allow fetching unknown libs' types from the CDN when the type oracle
   *  reports `Cannot find module` (default true in typecheck mode). */
  grab?: boolean;
  /** P5: run the real test command as an OS process in the oioxo desktop app
   *  (the strongest oracle). Ignored / throws in a plain browser. Overrides mode. */
  native?: boolean;
  /** Drive the loop with a bigger writer instead of the small WebGPU coder — same
   *  grounded prompt + verified loop. 'ollama' = a local model server on the user's
   *  machine; 'frontier' = the user's own frontier API key (BYOK, browser-direct). */
  coder?:
    | { kind: 'ollama'; model: string; base?: string }
    | { kind: 'frontier'; config: import('./frontier').FrontierConfig }
    /** 'oioxo' = OUR encrypted on-device coder, already unlocked + loaded into wllama by the
     *  UI (loadOioxoCoder); the loop runs it via makeOioxoWebGenerate. */
    | { kind: 'oioxo'; coder: import('./oioxo-coder-web').OioxoWebCoder };
  /** Override the generator entirely — how a no-WebGPU device plugs in a REMOTE
   *  coder (peer GPU / server HTTP, see remote-coder.ts): the verified loop runs
   *  locally, only generation is borrowed. Wins over `coder`/`match`. */
  generate?: GenerateFn;
  /** Verification-guided best-of-N per attempt (the conductor's RANK role, done by
   *  the oracle). >1 trades compute for correctness — a natural Pro "thorough" mode. */
  candidates?: number;
  /** Gem 2 — adaptive search cap: candidates ramp from `candidates` to this when
   *  stuck on the same error. Defaults to max(candidates, 4). */
  maxCandidates?: number;
  /** Gem 6b — regression safety: the names of the behavioral checks being run.
   *  When provided, the oracle is wrapped so breaking a once-passing check is a
   *  loop-fixable failure (never silently regress). Off when omitted. */
  getCheckNames?: () => string[];
  /** P6: capture each attempt so verified red→green repairs become conductor
   *  training data (surfaced as LoopResult.trajectory). Off by default. */
  record?: boolean;
  /** Engine for the oracle: 'python' runs the entry on Pyodide (traceback = fail),
   *  'sql' runs the script on sql.js (SQL error = fail); default is Node/TypeScript
   *  per `mode`/`native`. */
  runtime?: 'node' | 'python' | 'sql';
  /** Override the oracle entirely (e.g. the preview RUNTIME oracle for web/UI/games
   *  — run the app, capture runtime errors + checks). Wins over mode/runtime. */
  run?: RunFn;
  /** Cancel (the user's Stop). */
  signal?: AbortSignal;
  /** Search-when-stuck: look up persistent errors on the web, fold into the repair. */
  search?: (query: string) => Promise<string>;
  /** REMEMBER: recall the device's own verified fixes for a similar error. */
  recall?: (query: string) => Promise<string>;
  /** Human narration of what the agent is doing (the "watch it think" stream). */
  onNote?: (s: string) => void;
  /** VISIBILITY: stream the coder's DRAFT as it's written (live code in the editor)
   *  so the user always sees motion, even on a slow device. */
  onToken?: (info: { delta: string; full: string; path?: string; attempt: number }) => void;
}

/**
 * Build or fix on-device: install deps once (if there's a package.json), then run
 * the generate→execute→repair loop until the tests pass. Browser-only (needs the
 * cross-origin-isolated WebContainer); throws early if unsupported so the UI can
 * fall back to plain chat-edit.
 */
export async function buildOrFix(opts: BuildOptions): Promise<LoopResult> {
  let run: RunFn;
  let testCmd = opts.testCmd;
  // P4: external API signatures grabbed mid-loop, fed to the next draft.
  let extApis = '';
  const getExtApis = () => extApis;

  if (opts.run) {
    // Caller-provided oracle (e.g. the preview RUNTIME oracle) — wins over mode.
    run = opts.run;
    testCmd = testCmd ?? 'run';
  } else if (opts.runtime === 'python') {
    // Python oracle on Pyodide: run the entry; a traceback is the repair signal.
    run = makePythonRun(opts.onData);
    testCmd = 'python main.py';
  } else if (opts.runtime === 'sql') {
    // SQL oracle on sql.js: run the script; a SQL error is the repair signal.
    run = makeSqlRun(opts.onData);
    testCmd = 'sqlite main.sql';
  } else if (opts.native) {
    // P5 native tier: real OS process + real filesystem (desktop app only).
    if (!isDesktop()) throw new Error('Native execution requires the oioxo desktop app.');
    run = makeNativeRun({ onData: opts.onData });
    if (opts.files.some((f) => f.path === 'package.json')) {
      opts.onData?.('\n$ npm install\n');
      await run(opts.files, 'npm install').catch(() => {});
    }
  } else if (opts.mode === 'typecheck') {
    // Fast TYPE oracle — no WebContainer, no install, works anywhere. The lib map
    // grows as we grab unknown packages, so we own it here (not makeTypeCheckRun).
    const libs = new Map(opts.libFiles ?? []);
    const grab = opts.grab !== false;
    const grabbedAlready = new Set<string>();
    testCmd = 'typecheck';
    run = async (files: CodeFile[]): Promise<RunResult> => {
      let diags = await typeCheckFiles(files, libs);
      if (grab && diags.some((d) => d.code === 2307)) {
        // "Cannot find module 'X'" → fetch its real types, then re-check.
        const errs = formatDiags(diags);
        opts.onData?.(`\n· searching for missing packages…\n`);
        const res = await grabForErrors(errs, grabbedAlready).catch(() => null);
        if (res && res.grabbed.length) {
          for (const [p, c] of res.libFiles) libs.set(p, c);
          extApis = [extApis, res.apiIndex].filter(Boolean).join('\n\n').slice(0, 8000);
          opts.onData?.(`✓ grabbed ${res.grabbed.map((g) => `${g.name}@${g.version}`).join(', ')}\n`);
          diags = await typeCheckFiles(files, libs);
        }
      }
      const ok = diags.length === 0;
      const errors = formatDiags(diags);
      return { ok, output: ok ? '✓ No type errors.' : errors, errors };
    };
  } else {
    if (!runSupported()) throw new Error('On-device run needs a cross-origin-isolated Chromium browser.');
    run = makeWebContainerRun(opts.onData);
    // Install deps once up front (node_modules then persists across the loop's
    // re-mounts) so the test command can resolve imports.
    if (opts.files.some((f) => f.path === 'package.json')) {
      opts.onData?.('\n$ npm install\n');
      await run(opts.files, 'npm install').catch(() => {});
    }
  }
  // The writer. A caller-supplied generate WINS — that's how a no-WebGPU device
  // plugs in a REMOTE coder (peer GPU / server HTTP, see remote-coder.ts): the loop
  // + oracle run locally, only generation is borrowed. Else: bigger local Ollama,
  // BYOK frontier, or the small on-device coder (fed the verified-brick corpus so
  // the DRAFT adapts proven blocks instead of authoring from nothing).
  const generate: GenerateFn =
    opts.generate
      ? opts.generate
      : opts.coder?.kind === 'ollama'
        ? makeOllamaGenerate(opts.coder.model, { base: opts.coder.base, getExtApis })
        : opts.coder?.kind === 'frontier'
          ? makeFrontierGenerate(opts.coder.config, { getExtApis })
          : opts.coder?.kind === 'oioxo'
            ? makeOioxoWebGenerate(opts.coder.coder, { getExtApis })
            : makeCoderGenerate(opts.match, { onProgress: opts.onProgress, getExtApis, recallBricks, onToken: opts.onToken });

  // Gem 6b — wrap the oracle so a regression (a once-passing check now broken) is
  // surfaced as a failure the loop must fix. Opt-in via getCheckNames; default off.
  if (opts.getCheckNames) {
    run = makeRegressionRun(run, new RegressionGuard(), opts.getCheckNames);
  }

  const result = await runCodeLoop({
    task: opts.task,
    files: opts.files,
    testCmd,
    maxIters: opts.maxIters,
    candidates: opts.candidates,
    // Gem 2 — adaptive search: ramp candidates when stuck (up to 4) so the device
    // searches harder only where a single shot keeps failing.
    maxCandidates: opts.maxCandidates ?? Math.max(opts.candidates ?? 1, 4),
    record: opts.record,
    signal: opts.signal,
    search: opts.search,
    recall: opts.recall,
    onNote: opts.onNote,
    generate,
    run,
    onStep: opts.onStep,
  });

  // GROW THE CORPUS: a green build is an oracle-verified unit — harvest it so the
  // next similar task can reuse it. Guarded + no-op in Node/SSR, never throws.
  if (result.ok) {
    void rememberVerifiedBuild(opts.task, result.files).catch(() => {});
    // Gem 3 — memoize the whole solved goal so a near-identical request can REPLAY
    // it (zero model calls) or warm-start from it. No-op in Node/SSR, never throws.
    void rememberSolution(opts.task, result.files, { runtime: opts.runtime, testCmd }).catch(() => {});
  }
  return result;
}

/**
 * Gem 3 — replay-aware build entry. Checks the solved-goal cache FIRST: an exact
 * match replays the cached project (re-verified, ~0 model calls), a similar one
 * warm-starts the loop from it, else builds from scratch. Drop-in for the agent's
 * per-goal build; `verify` re-checks cached files with the caller's oracle (or a
 * quick type-check). Returns the replay outcome + the underlying loop result.
 */
export async function buildWithMemory(opts: BuildOptions & { goal?: string }): Promise<ReplayOutcome & { loop?: LoopResult }> {
  const goal = (opts.goal ?? opts.task).trim();
  const verifier = opts.run ?? makeTypeCheckRun(opts.libFiles);
  let loop: LoopResult | undefined;
  const outcome = await replayOrBuild({
    goal,
    scratchFiles: opts.files,
    recall: (g) => recallSolution(g),
    verify: (files) => verifier(files, opts.testCmd ?? 'verify'),
    build: async (startFiles) => {
      loop = await buildOrFix({ ...opts, files: startFiles });
      return { files: loop.files, ok: loop.ok, iters: loop.iters, modelCalls: loop.iters };
    },
    onNote: opts.onNote,
  });
  return { ...outcome, loop };
}
