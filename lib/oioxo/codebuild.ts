/**
 * oioxo Code — high-level entry that composes the loop end-to-end: the on-device
 * coder (generator) + the WebContainer oracle (runner) → generate→run→repair→
 * green. This is what the workspace UI calls. (OIOXO_CODE.md P1.)
 */
import { runCodeLoop, type CodeFile, type LoopResult } from './codeloop';
import { makeCoderGenerate } from './codegen';
import { makeWebContainerRun, runSupported } from './coderun';

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
  /** Max generate→run cycles (default 5). */
  maxIters?: number;
  /** Live run log. */
  onData?: (chunk: string) => void;
  /** Model download/init progress (0..1). */
  onProgress?: (p: number) => void;
  /** Per-attempt outcome for the UI timeline. */
  onStep?: (s: { attempt: number; ok: boolean; errors: string }) => void;
}

/**
 * Build or fix on-device: install deps once (if there's a package.json), then run
 * the generate→execute→repair loop until the tests pass. Browser-only (needs the
 * cross-origin-isolated WebContainer); throws early if unsupported so the UI can
 * fall back to plain chat-edit.
 */
export async function buildOrFix(opts: BuildOptions): Promise<LoopResult> {
  if (!runSupported()) throw new Error('On-device run needs a cross-origin-isolated Chromium browser.');
  const run = makeWebContainerRun(opts.onData);
  // Install deps once up front (node_modules then persists across the loop's
  // re-mounts) so the test command can resolve imports.
  if (opts.files.some((f) => f.path === 'package.json')) {
    opts.onData?.('\n$ npm install\n');
    await run(opts.files, 'npm install').catch(() => {});
  }
  return runCodeLoop({
    task: opts.task,
    files: opts.files,
    testCmd: opts.testCmd,
    maxIters: opts.maxIters,
    generate: makeCoderGenerate(opts.match, { onProgress: opts.onProgress }),
    run,
    onStep: opts.onStep,
  });
}
