/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * oioxo Code P2 — the in-browser TYPE oracle (OIOXO_CODE.md P2). Type-checks the
 * project with the real TypeScript compiler over an in-memory file map, returning
 * exact diagnostics. This is a FAST, exact gate (no npm install, no run) the
 * repair loop uses before — or instead of — the heavier WebContainer test run:
 * a hallucinated API or wrong type is caught instantly and fed back.
 *
 * Isomorphic: in Node (and tests) the default-lib files come from `ts.sys`; in
 * the browser the caller supplies a lib map (via @typescript/vfs' CDN snapshots)
 * — the only browser-specific bit, kept injectable.
 */
import type { CodeFile, RunFn, RunResult } from './codeloop';

export interface TypeDiag {
  file: string;
  line: number;
  column: number;
  code: number;
  message: string;
}

const TS_RE = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;
const norm = (p: string) => p.replace(/\\/g, '/');

/** Type-check the TS/JS files and return exact diagnostics (empty = clean). */
export async function typeCheckFiles(files: CodeFile[], libFiles?: Map<string, string>): Promise<TypeDiag[]> {
  const ts: any = (await import('typescript')).default ?? (await import('typescript'));
  const src = files.filter((f) => TS_RE.test(f.path));
  if (!src.length) return [];
  const map = new Map(src.map((f) => [norm(f.path), f.content]));
  const sys = ts.sys; // present in Node; undefined in the browser
  const options = {
    noEmit: true,
    allowJs: true,
    checkJs: false,
    strict: false,
    skipLibCheck: true,
    esModuleInterop: true,
    target: ts.ScriptTarget.ES2020,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler ?? ts.ModuleResolutionKind.NodeNext,
    jsx: ts.JsxEmit.ReactJSX,
  };
  // The vfs CDN lib map keys lib files as `/lib.es2020.d.ts`; lib files also
  // cross-reference each other by bare name (`lib.es2015.d.ts`). Resolve a lib
  // request against the map tolerantly (with/without leading slash).
  const fromLibs = (f: string): string | undefined => {
    if (!libFiles) return undefined;
    const n = norm(f);
    const base = n.replace(/^.*\//, '');
    return libFiles.get(n) ?? libFiles.get('/' + base) ?? libFiles.get(base);
  };
  const read = (f: string) => map.get(norm(f)) ?? fromLibs(f) ?? sys?.readFile?.(f);
  const host: any = {
    fileExists: (f: string) => read(f) != null,
    readFile: read,
    getSourceFile: (f: string, lang: any) => {
      const text = read(f);
      return text != null ? ts.createSourceFile(f, text, lang, true) : undefined;
    },
    // Browser: no filesystem — return the bare lib name so it resolves against
    // the injected lib map. Node: the absolute on-disk path via ts.sys.
    getDefaultLibFileName: (o: any) =>
      libFiles ? ts.getDefaultLibFileName(o) : ts.getDefaultLibFilePath(o),
    writeFile: () => {},
    getCurrentDirectory: () => sys?.getCurrentDirectory?.() ?? '/',
    getDirectories: (p: string) => sys?.getDirectories?.(p) ?? [],
    getCanonicalFileName: (f: string) => f,
    useCaseSensitiveFileNames: () => true,
    getNewLine: () => '\n',
    fileNameToModuleName: undefined,
  };
  const program = ts.createProgram(Array.from(map.keys()), options, host);
  const diags = [...program.getSyntacticDiagnostics(), ...program.getSemanticDiagnostics()];
  return diags
    .filter((d: any) => d.file && map.has(norm(d.file.fileName)))
    .map((d: any) => {
      const pos = d.start != null ? d.file.getLineAndCharacterOfPosition(d.start) : { line: 0, character: 0 };
      return {
        file: norm(d.file.fileName),
        line: pos.line + 1,
        column: pos.character + 1,
        code: d.code,
        message: ts.flattenDiagnosticMessageText(d.messageText, '\n'),
      };
    });
}

/** Format diagnostics like `tsc` (for the model's repair context + the UI). */
export function formatDiags(diags: TypeDiag[]): string {
  return diags.map((d) => `${d.file}:${d.line}:${d.column} - TS${d.code}: ${d.message}`).join('\n');
}

/** A RunFn = the TYPE oracle: pass means zero type errors. Fast (no install/run),
 *  works even without a cross-origin-isolated WebContainer. */
export function makeTypeCheckRun(libFiles?: Map<string, string>): RunFn {
  return async (files: CodeFile[]): Promise<RunResult> => {
    const diags = await typeCheckFiles(files, libFiles);
    const ok = diags.length === 0;
    const errors = formatDiags(diags);
    return { ok, output: ok ? '✓ No type errors.' : errors, errors };
  };
}
