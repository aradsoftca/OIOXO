/**
 * oioxo Native Mesh — WEB↔NATIVE BRIDGE (OIOXO_NATIVE_MESH.md). The single seam between
 * the web app and the Tauri Rust core. The SAME frontend runs in a browser and inside
 * the native shell; this module detects which, and when native, wires the Rust commands
 * (invoked via the global `window.__TAURI__.core.invoke`) into the existing mesh seams:
 *   • a native GenerateFn (full-GPU model run)  → coder pool / buildOrFix.generate
 *   • a native RunFn (real process exec oracle)  → verify pool / buildOrFix.run
 *   • OS-keychain device key + a LAN provider endpoint.
 *
 * Web-safe by construction: on a plain browser `isNative()` is false, nothing is
 * imported, and every accessor returns undefined — so the deployed web build is
 * unaffected and this typechecks with no Tauri dependency (we read the runtime global
 * Tauri injects when `withGlobalTauri` is enabled, rather than importing @tauri-apps/*).
 */
import type { GenContext, Edit, GenerateFn, RunFn, RunResult, CodeFile } from './codeloop';

/** Minimal shape of the global Tauri injects (withGlobalTauri: true). */
type Invoke = <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;
function invoker(): Invoke | null {
  if (typeof window === 'undefined') return null;
  const t = (window as unknown as { __TAURI__?: { core?: { invoke?: Invoke } } }).__TAURI__;
  return t?.core?.invoke ?? null;
}

/** True when running inside the native (Tauri) shell. */
export function isNative(): boolean {
  return invoker() !== null;
}

/** Native model run (Metal/CUDA/Vulkan/NPU) → edits. Undefined on the web. */
export function nativeGenerate(): GenerateFn | undefined {
  const invoke = invoker();
  if (!invoke) return undefined;
  return async (ctx: GenContext): Promise<Edit[]> => {
    try {
      const edits = await invoke<Edit[]>('mesh_generate', { ctx });
      return Array.isArray(edits) ? edits : [];
    } catch {
      return [];
    }
  };
}

/** Native real-process oracle — reuses the existing `write_files` + `exec` commands
 *  (the proven desktop native tier), so a peer can borrow THIS device's real test run.
 *  Undefined on the web. */
export function nativeRun(): RunFn | undefined {
  const invoke = invoker();
  if (!invoke) return undefined;
  return async (files: CodeFile[], cmd: string): Promise<RunResult> => {
    try {
      const dir = await invoke<string>('write_files', { files });
      const r = await invoke<{ code: number; stdout: string; stderr: string }>('exec', { command: cmd, cwd: dir });
      const ok = r.code === 0;
      const output = `${r.stdout}${r.stderr}`.trim();
      return { ok, output, errors: ok ? '' : (r.stderr || r.stdout || `exit ${r.code}`) };
    } catch (e) {
      return { ok: false, output: '', errors: String((e as Error)?.message || e) };
    }
  };
}

/** Start the LAN provider endpoint ("API device"); returns its URL for makeHttpCoder. */
export async function startLanProvider(port = 0): Promise<string | null> {
  const invoke = invoker();
  if (!invoke) return null;
  try { return await invoke<string>('lan_serve_start', { port }); } catch { return null; }
}

export async function stopLanProvider(): Promise<void> {
  const invoke = invoker();
  if (!invoke) return;
  try { await invoke('lan_serve_stop'); } catch { /* ignore */ }
}

export interface MeshSibling { url: string; deviceId: string; label?: string }

/** Discover sibling provider endpoints on the LAN via mDNS (native only). */
export async function discoverSiblings(): Promise<MeshSibling[]> {
  const invoke = invoker();
  if (!invoke) return [];
  try { return (await invoke<MeshSibling[]>('mdns_discover')) ?? []; } catch { return []; }
}

/** Read/persist the device private key material in the OS keychain (native only). */
export async function keychainGet(account: string): Promise<string | null> {
  const invoke = invoker();
  if (!invoke) return null;
  try { return await invoke<string | null>('keychain_get', { account }); } catch { return null; }
}
export async function keychainSet(account: string, value: string): Promise<boolean> {
  const invoke = invoker();
  if (!invoke) return false;
  try { await invoke('keychain_set', { account, value }); return true; } catch { return false; }
}

/**
 * The local engines this NATIVE device offers when lending — prefer native (full GPU /
 * real exec) over the webview ones. On the web both are undefined and the caller falls
 * back to makeCoderGenerate / makeTypeCheckRun. Drop-in for MeshPanel's lend props.
 */
export function nativeLendEngines(): { generate?: GenerateFn; run?: RunFn } {
  return { generate: nativeGenerate(), run: nativeRun() };
}
