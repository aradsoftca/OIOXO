/**
 * oioxo Code — high-level entry that composes the loop end-to-end: the on-device
 * coder (generator) + the WebContainer oracle (runner) → generate→run→repair→
 * green. This is what the workspace UI calls. (OIOXO_CODE.md P1.)
 */
import { runCodeLoop, type CodeFile, type GenerateFn, type LoopResult, type RunFn, type RunResult } from './codeloop';
import { makeCoderGenerate } from './codegen';
import { makeWebContainerRun, runSupported } from './coderun';
import { typeCheckFiles, formatDiags } from './typecheck';
import { grabForErrors } from './grab';
import { makeNativeRun } from './nativerun';
import { makeOllamaGenerate } from './bigcoder';
import { isDesktop } from './native';
import { makePythonRun } from './pyodide';

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
  /** P5: drive the loop with a bigger LOCAL coder via Ollama instead of the small
   *  WebGPU coder — same prompt + loop, still on the user's own machine. */
  coder?: { kind: 'ollama'; model: string; base?: string };
  /** Verification-guided best-of-N per attempt (the conductor's RANK role, done by
   *  the oracle). >1 trades compute for correctness — a natural Pro "thorough" mode. */
  candidates?: number;
  /** P6: capture each attempt so verified red→green repairs become conductor
   *  training data (surfaced as LoopResult.trajectory). Off by default. */
  record?: boolean;
  /** Interpreter for the oracle: 'python' runs the entry on Pyodide (a raised
   *  traceback = fail); default is Node/TypeScript per `mode`/`native`. */
  runtime?: 'node' | 'python';
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

  if (opts.runtime === 'python') {
    // Python oracle on Pyodide: run the entry; a traceback is the repair signal.
    run = makePythonRun(opts.onData);
    testCmd = 'python main.py';
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
  // The writer: bigger local Ollama coder if requested, else the small WebGPU
  // coder. Either way the SAME grounded prompt + grab closure + verified loop.
  const generate: GenerateFn =
    opts.coder?.kind === 'ollama'
      ? makeOllamaGenerate(opts.coder.model, { base: opts.coder.base, getExtApis })
      : makeCoderGenerate(opts.match, { onProgress: opts.onProgress, getExtApis });

  return runCodeLoop({
    task: opts.task,
    files: opts.files,
    testCmd,
    maxIters: opts.maxIters,
    candidates: opts.candidates,
    record: opts.record,
    generate,
    run,
    onStep: opts.onStep,
  });
}
