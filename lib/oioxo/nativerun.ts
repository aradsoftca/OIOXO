/**
 * oioxo Code P5 — the NATIVE execution oracle (OIOXO_CODE.md §4 "Native / Tauri").
 * On the desktop app the loop runs the GENUINE test command as a real OS process
 * against the real filesystem — the strongest possible ground truth, no WASM
 * sandbox approximation, full speed + full toolchain (npm, pytest, cargo, …).
 *
 * It composes the desktop bridge (native.ts: `write_files` + `exec`) into a
 * `RunFn`, so it drops straight into the same `runCodeLoop` the browser tiers use.
 * Web-safe: only ever called when `isDesktop()` is true.
 */
import type { CodeFile, RunFn, RunResult } from './codeloop';
import { extractErrors } from './codeloop';
import { isDesktop, writeNativeFiles, execNative } from './native';

export interface NativeRunOptions {
  /** Workspace dir on the real disk (default: a temp dir chosen by the app). */
  dir?: string;
  /** Live output. */
  onData?: (chunk: string) => void;
}

/**
 * A RunFn backed by real exec on the desktop: materialize the project on disk,
 * run the actual command, capture output + the genuine exit code (the oracle).
 */
export function makeNativeRun(opts: NativeRunOptions = {}): RunFn {
  return async (files: CodeFile[], cmd: string): Promise<RunResult> => {
    if (!isDesktop()) throw new Error('Native run requires the oioxo desktop app.');
    const dir = await writeNativeFiles(files, opts.dir);
    const res = await execNative(cmd, dir);
    const output = `$ ${cmd}\n${res.stdout}${res.stderr}\n[exit ${res.code}]\n`;
    opts.onData?.(output);
    const ok = res.code === 0;
    return { ok, output, errors: ok ? '' : extractErrors(output) };
  };
}
