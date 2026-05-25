/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * oioxo Agentic IDE (AGENTIC_IDE.md §4) — a PYTHON runtime, on-device. WebContainer
 * runs only Node, so Python projects run on Pyodide (CPython compiled to WASM),
 * loaded from CDN the first time a Python project runs. Same shape as the Node
 * runner: write the files into the in-WASM filesystem, run the entry, capture
 * stdout/stderr. A raised exception (traceback) is the agent's repair signal —
 * the same execute→repair loop, a different interpreter.
 */
import type { CodeFile, RunResult, RunFn } from './codeloop';

const PYODIDE_VERSION = 'v0.26.4';
const INDEX = `https://cdn.jsdelivr.net/pyodide/${PYODIDE_VERSION}/full/`;

let _py: any = null;
let _loading: Promise<any> | null = null;

export function pythonSupported(): boolean {
  return typeof window !== 'undefined' && typeof WebAssembly !== 'undefined';
}

/** Load Pyodide once (lazy — the ~10MB runtime only downloads when first needed). */
export async function loadPy(onProgress?: (p: number) => void): Promise<any> {
  if (_py) return _py;
  _loading ??= (async () => {
    if (!(window as any).loadPyodide) {
      await new Promise<void>((res, rej) => {
        const s = document.createElement('script');
        s.src = INDEX + 'pyodide.js';
        s.onload = () => res();
        s.onerror = () => rej(new Error('Could not load the Python runtime (offline?).'));
        document.head.appendChild(s);
      });
    }
    onProgress?.(0.5);
    _py = await (window as any).loadPyodide({ indexURL: INDEX });
    onProgress?.(1);
    return _py;
  })();
  return _loading;
}

const norm = (p: string) => p.replace(/\\/g, '/').replace(/^\.?\//, '');

/** Run a Python project: write the .py/.txt files into the WASM FS and execute
 *  the entry as __main__. Returns the same {ok,output,errors} the loop expects. */
export async function runPython(
  files: CodeFile[],
  entry = 'main.py',
  onData?: (chunk: string) => void,
): Promise<RunResult> {
  const py = await loadPy();
  let out = '';
  const capture = (s: string) => { out += s + '\n'; onData?.(s + '\n'); };
  py.setStdout({ batched: capture });
  py.setStderr({ batched: capture });

  for (const f of files) {
    const path = norm(f.path);
    if (!/\.(py|txt|json|csv|md|cfg|ini)$/i.test(path)) continue; // python-relevant only
    const dir = path.split('/').slice(0, -1).join('/');
    try { if (dir) py.FS.mkdirTree(dir); py.FS.writeFile(path, f.content); } catch { /* skip */ }
  }

  const entryPath = files.find((f) => norm(f.path) === entry || norm(f.path).endsWith('/' + entry)) ? entry : norm(files[0]?.path ?? entry);
  let errors = '';
  try {
    // run the entry in a fresh namespace so re-runs don't leak globals
    await py.runPythonAsync(`import runpy\nrunpy.run_path(${JSON.stringify(entryPath)}, run_name='__main__')`);
  } catch (e: any) {
    errors = String(e?.message || e).trim();
    onData?.(errors + '\n');
  }
  return { ok: !errors, output: out, errors };
}

/** A RunFn over Pyodide for the verified loop — the Python oracle (no traceback
 *  = pass). The cmd is ignored (always runs the entry). */
export function makePythonRun(onData?: (chunk: string) => void, entry = 'main.py'): RunFn {
  return async (files: CodeFile[]): Promise<RunResult> => runPython(files, entry, onData);
}
