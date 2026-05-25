/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * oioxo Agentic IDE (AGENTIC_IDE.md §4) — a SQL runtime, on-device. SQLite
 * compiled to WASM (sql.js) runs a project's .sql script entirely in the tab and
 * prints SELECT results as text tables. Same shape as the Python runner: a SQL
 * error is the agent's repair signal — execute→repair, a different engine.
 */
import type { CodeFile, RunResult, RunFn } from './codeloop';

const SQLJS_VERSION = '1.12.0';
const CDN = `https://cdnjs.cloudflare.com/ajax/libs/sql.js/${SQLJS_VERSION}/`;

let _SQL: any = null;
let _loading: Promise<any> | null = null;

export function sqlSupported(): boolean {
  return typeof window !== 'undefined' && typeof WebAssembly !== 'undefined';
}

/** Load sql.js once (the WASM only downloads when a SQL project first runs). */
export async function loadSql(): Promise<any> {
  if (_SQL) return _SQL;
  _loading ??= (async () => {
    if (!(window as any).initSqlJs) {
      await new Promise<void>((res, rej) => {
        const s = document.createElement('script');
        s.src = CDN + 'sql-wasm.js';
        s.onload = () => res();
        s.onerror = () => rej(new Error('Could not load the SQL runtime (offline?).'));
        document.head.appendChild(s);
      });
    }
    _SQL = await (window as any).initSqlJs({ locateFile: (f: string) => CDN + f });
    return _SQL;
  })();
  return _loading;
}

const norm = (p: string) => p.replace(/\\/g, '/').replace(/^\.?\//, '');

/** Render a sql.js result set as a simple aligned text table. */
function renderTable(res: { columns: string[]; values: any[][] }): string {
  const cols = res.columns;
  const rows = res.values.map((r) => r.map((v) => (v === null ? 'NULL' : String(v))));
  const widths = cols.map((c, i) => Math.max(c.length, ...rows.map((r) => r[i].length), 0));
  const line = (cells: string[]) => '| ' + cells.map((c, i) => c.padEnd(widths[i])).join(' | ') + ' |';
  const sep = '|' + widths.map((w) => '-'.repeat(w + 2)).join('|') + '|';
  return [line(cols), sep, ...rows.map(line)].join('\n');
}

/**
 * Run a SQL project: concatenate its .sql files (entry first) and execute. Each
 * statement runs; SELECTs print their result table. Returns {ok,output,errors}.
 */
export async function runSql(
  files: CodeFile[],
  entry = 'main.sql',
  onData?: (chunk: string) => void,
): Promise<RunResult> {
  const SQL = await loadSql();
  const sqlFiles = files.filter((f) => /\.sql$/i.test(norm(f.path)));
  const ordered = [
    ...sqlFiles.filter((f) => norm(f.path) === entry || norm(f.path).endsWith('/' + entry)),
    ...sqlFiles.filter((f) => !(norm(f.path) === entry || norm(f.path).endsWith('/' + entry))),
  ];
  const script = ordered.map((f) => f.content).join('\n');
  let out = '';
  const emit = (s: string) => { out += s + '\n'; onData?.(s + '\n'); };

  const db = new SQL.Database();
  let errors = '';
  try {
    // exec returns one result per SELECT-bearing statement; DDL/DML return none
    const results = db.exec(script);
    if (!results.length) emit('(statements ran; no rows returned)');
    for (const r of results) emit(renderTable(r) + `\n(${r.values.length} row${r.values.length === 1 ? '' : 's'})`);
  } catch (e: any) {
    errors = String(e?.message || e).trim();
    onData?.(errors + '\n');
  } finally {
    try { db.close(); } catch { /* */ }
  }
  return { ok: !errors, output: out, errors };
}

/** A RunFn over sql.js for the verified loop — a SQL error = fail. */
export function makeSqlRun(onData?: (chunk: string) => void, entry = 'main.sql'): RunFn {
  return async (files: CodeFile[]): Promise<RunResult> => runSql(files, entry, onData);
}
