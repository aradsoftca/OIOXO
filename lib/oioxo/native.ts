/**
 * oioxo desktop bridge. Web-SAFE: deliberately imports nothing from @tauri-apps
 * so the PWA build never depends on it. Inside the oioxo desktop app (Tauri v2
 * with withGlobalTauri), `window.__TAURI__` exists and we call its `exec`
 * command to run on the REAL machine. In a normal browser this is absent and
 * callers fall back to the in-browser sandbox (WebContainer).
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

/** True when running inside the oioxo native desktop shell. */
export function isDesktop(): boolean {
  return typeof window !== 'undefined' && !!(window as any).__TAURI__;
}

function tauriInvoke(): ((cmd: string, args?: Record<string, unknown>) => Promise<any>) | null {
  if (typeof window === 'undefined') return null;
  const t = (window as any).__TAURI__;
  return t?.core?.invoke ?? t?.invoke ?? null;
}

export interface ExecResult {
  code: number;
  stdout: string;
  stderr: string;
}

/** Run a shell command on the user's real machine (desktop app only). The Rust
 *  side implements the `exec` command; see src-tauri. Throws in the PWA. */
export async function execNative(command: string, cwd?: string): Promise<ExecResult> {
  const invoke = tauriInvoke();
  if (!invoke) throw new Error('Native execution is only available in the oioxo desktop app.');
  return invoke('exec', { command, cwd }) as Promise<ExecResult>;
}

/** Stream a long-running command's output (desktop only), via Tauri events.
 *  Returns the exit code. No-op-throws in the PWA. */
export async function execNativeStream(
  command: string,
  cwd: string | undefined,
  onData: (chunk: string) => void,
): Promise<number> {
  const invoke = tauriInvoke();
  const t = typeof window !== 'undefined' ? (window as any).__TAURI__ : null;
  if (!invoke || !t?.event?.listen) throw new Error('Native execution is only available in the oioxo desktop app.');
  const id = `exec-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const unlisten: () => void = await t.event.listen(id, (e: any) => onData(String(e?.payload ?? '')));
  try {
    const code = (await invoke('exec_stream', { command, cwd, channel: id })) as number;
    return code;
  } finally {
    try {
      unlisten();
    } catch {
      /* ignore */
    }
  }
}

/** Write the project to a real directory (desktop only) via the Rust `write_files`
 *  command, so the native runner can execute the genuine test command against it.
 *  Returns the workspace dir. Throws in the PWA. */
export async function writeNativeFiles(files: { path: string; content: string }[], dir?: string): Promise<string> {
  const invoke = tauriInvoke();
  if (!invoke) throw new Error('Native filesystem is only available in the oioxo desktop app.');
  return invoke('write_files', { files, dir }) as Promise<string>;
}
