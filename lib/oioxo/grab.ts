/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * oioxo Code P4 — search-grab-fix (OIOXO_CODE.md §3 "something new", P4). When a
 * task needs a library the project doesn't have, the model shouldn't *recall* its
 * API (weights hallucinate) — it should GRAB the real thing and generate against
 * it, exactly like a frontier model "gets, designs, uses" a new dependency.
 *
 * The signal is precise + free: the in-browser type oracle reports `Cannot find
 * module 'X'` (TS2307). That name is the search query. We fetch the package's real
 * `.d.ts` + README from a public CDN (jsDelivr — CORS `*`, no install, on-device),
 * drop the types into the type-oracle lib map so usage is *verified*, and feed the
 * exact signatures to the coder so it uses real APIs. get → grab → use → verify.
 *
 * Fetch is injectable, so detection + parsing + assembly are Node-testable; only
 * the live network call needs the browser (or Node's global fetch).
 */
import type { CodeFile } from './codeloop';
import { extractSymbols } from './retrieve';

const CDN = 'https://cdn.jsdelivr.net/npm';
const DATA = 'https://data.jsdelivr.com/v1/packages/npm';

/** Node built-ins — never grabbed (resolved by the runtime, not npm). */
const BUILTIN = new Set([
  'assert', 'async_hooks', 'buffer', 'child_process', 'cluster', 'console', 'constants', 'crypto',
  'dgram', 'diagnostics_channel', 'dns', 'domain', 'events', 'fs', 'http', 'http2', 'https', 'inspector',
  'module', 'net', 'os', 'path', 'perf_hooks', 'process', 'punycode', 'querystring', 'readline', 'repl',
  'stream', 'string_decoder', 'sys', 'timers', 'tls', 'trace_events', 'tty', 'url', 'util', 'v8', 'vm',
  'wasi', 'worker_threads', 'zlib',
]);

type Resp = { ok: boolean; status: number; text(): Promise<string>; json(): Promise<any> };
export type Fetcher = (url: string) => Promise<Resp>;
const defaultFetch: Fetcher = (url) => fetch(url) as unknown as Promise<Resp>;

/** The bare package name from an import specifier: `@scope/x/sub` → `@scope/x`,
 *  `lodash/fp` → `lodash`, `node:fs` → `fs`. Returns '' for relative paths. */
export function packageOf(spec: string): string {
  let s = spec.trim();
  if (!s || s.startsWith('.') || s.startsWith('/')) return '';
  if (s.startsWith('node:')) s = s.slice(5);
  const parts = s.split('/');
  return s.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
}

const IMPORT_RE = /(?:import|export)\s[\s\S]*?from\s*['"]([^'"]+)['"]|(?:import|require)\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

/** All bare (npm) package names imported across the project — deduped, no
 *  built-ins, no relative paths. Pure. */
export function detectImports(files: CodeFile[]): string[] {
  const out = new Set<string>();
  for (const f of files) {
    if (!/\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/.test(f.path)) continue;
    let m: RegExpExecArray | null;
    IMPORT_RE.lastIndex = 0;
    while ((m = IMPORT_RE.exec(f.content))) {
      const pkg = packageOf(m[1] || m[2] || '');
      if (pkg && !BUILTIN.has(pkg)) out.add(pkg);
    }
  }
  return [...out];
}

/** Package names from `Cannot find module 'X'` (TS2307) diagnostics — the grab
 *  signal straight from the type oracle. Pure. */
export function missingFromErrors(errors: string): string[] {
  const out = new Set<string>();
  const re = /Cannot find module '([^']+)'|Cannot find name '([^']+)'.*module/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(errors))) {
    const pkg = packageOf(m[1] || m[2] || '');
    if (pkg && !BUILTIN.has(pkg)) out.add(pkg);
  }
  return [...out];
}

export interface GrabbedPackage {
  name: string;
  version: string;
  /** `.d.ts` (+ package.json) under `node_modules/<name>/…`, for the lib map. */
  files: CodeFile[];
  /** The package's own types entry, if it ships any. */
  entry?: string;
  /** First chunk of the README, for the prompt (usage in the author's words). */
  readme?: string;
  /** True if the types came from DefinitelyTyped (`@types/<name>`). */
  fromTypes?: boolean;
}

async function resolveVersion(pkg: string, fetcher: Fetcher): Promise<string | null> {
  const r = await fetcher(`${DATA}/${pkg}/resolved`).catch(() => null);
  if (!r || !r.ok) return null;
  const j = await r.json().catch(() => null);
  return j?.version ?? null;
}

/** Flatten jsDelivr's nested file tree to absolute-in-package paths. */
function flatten(node: any, prefix = ''): string[] {
  if (!node) return [];
  if (Array.isArray(node)) return node.flatMap((n) => flatten(n, prefix));
  if (node.type === 'directory') return flatten(node.files, `${prefix}/${node.name}`);
  if (node.type === 'file') return [`${prefix}/${node.name}`];
  return [];
}

async function listDts(pkg: string, ver: string, fetcher: Fetcher): Promise<string[]> {
  const r = await fetcher(`${DATA}/${pkg}@${ver}`).catch(() => null);
  if (!r || !r.ok) return [];
  const j = await r.json().catch(() => null);
  return flatten(j?.files)
    .filter((p) => /\.d\.(ts|mts|cts)$/.test(p))
    .map((p) => p.replace(/^\//, ''));
}

/**
 * Grab one package's real types + README from the CDN. Tries the package's own
 * bundled `.d.ts` first; if it ships none, falls back to `@types/<name>`
 * (DefinitelyTyped). Returns null if nothing typed is found. Bounded so a huge
 * package can't blow up the prompt or memory.
 */
export async function grabPackage(
  name: string,
  opts: { fetch?: Fetcher; maxFiles?: number; maxBytes?: number } = {},
): Promise<GrabbedPackage | null> {
  const fetcher = opts.fetch ?? defaultFetch;
  const maxFiles = opts.maxFiles ?? 40;
  const maxBytes = opts.maxBytes ?? 600_000;

  const pull = async (pkg: string, fromTypes: boolean): Promise<GrabbedPackage | null> => {
    const ver = await resolveVersion(pkg, fetcher);
    if (!ver) return null;
    const dts = await listDts(pkg, ver, fetcher);
    if (!dts.length) return null;

    // package.json is needed for TS to resolve the `types`/`exports` entry.
    const files: CodeFile[] = [];
    const pkgJsonR = await fetcher(`${CDN}/${pkg}@${ver}/package.json`).catch(() => null);
    let entry: string | undefined;
    if (pkgJsonR?.ok) {
      const txt = await pkgJsonR.text().catch(() => '');
      files.push({ path: `node_modules/${pkg}/package.json`, content: txt });
      try {
        const pj = JSON.parse(txt);
        entry = pj.types || pj.typings;
      } catch { /* keep going */ }
    }

    let bytes = 0;
    for (const rel of dts.slice(0, maxFiles)) {
      const fr = await fetcher(`${CDN}/${pkg}@${ver}/${rel}`).catch(() => null);
      if (!fr?.ok) continue;
      const content = await fr.text().catch(() => '');
      bytes += content.length;
      if (bytes > maxBytes) break;
      files.push({ path: `node_modules/${pkg}/${rel}`, content });
    }
    if (!files.some((f) => /\.d\.(ts|mts|cts)$/.test(f.path))) return null;

    let readme: string | undefined;
    const rdR = await fetcher(`${CDN}/${pkg}@${ver}/README.md`).catch(() => null);
    if (rdR?.ok) readme = (await rdR.text().catch(() => '')).slice(0, 2500) || undefined;

    return { name, version: ver, files, entry: entry?.replace(/^\.\//, ''), readme, fromTypes };
  };

  // Own types first; DefinitelyTyped as the fallback for untyped packages.
  return (await pull(name, false)) ?? (name.startsWith('@types/') ? null : await pull(`@types/${name.replace('@', '').replace('/', '__')}`, true).then((g) => (g ? { ...g, name } : null)));
}

export interface GrabResult {
  /** Grabbed `.d.ts` (+ package.json) keyed by path — merge into the type-oracle
   *  lib map so imports resolve and usage is type-checked. */
  libFiles: Map<string, string>;
  /** Exact external API signatures, formatted for the coder's prompt. */
  apiIndex: string;
  /** What was grabbed (for the UI / logs). */
  grabbed: GrabbedPackage[];
}

/** Build a compact, grounded API index for the coder from grabbed packages:
 *  real signatures (via the TS compiler over the `.d.ts`) + a README snippet. */
export async function summarizeGrabbed(pkgs: GrabbedPackage[], maxSymbols = 40): Promise<string> {
  const blocks: string[] = [];
  for (const p of pkgs) {
    const dts = p.files.filter((f) => /\.d\.(ts|mts|cts)$/.test(f.path));
    const syms = await extractSymbols(dts).catch(() => []);
    const sigs = syms.slice(0, maxSymbols).map((s) => `  ${s.kind} ${s.signature}`).join('\n');
    const head = p.readme ? `\nREADME:\n${p.readme.slice(0, 1200)}` : '';
    blocks.push(`Package "${p.name}"@${p.version} (real API — call these exactly):\n${sigs || '  (types only)'}${head}`);
  }
  return blocks.join('\n\n');
}

/**
 * Grab every package named in the errors (TS2307) that we haven't grabbed yet.
 * Accumulates across loop iterations via the `already` set the caller owns.
 */
export async function grabForErrors(
  errors: string,
  already: Set<string>,
  opts: { fetch?: Fetcher } = {},
): Promise<GrabResult> {
  const wanted = missingFromErrors(errors).filter((p) => !already.has(p));
  const grabbed: GrabbedPackage[] = [];
  const libFiles = new Map<string, string>();
  for (const name of wanted) {
    already.add(name); // mark attempted even on failure, so we don't loop on it
    const g = await grabPackage(name, opts).catch(() => null);
    if (g) {
      grabbed.push(g);
      for (const f of g.files) libFiles.set(f.path.replace(/\\/g, '/'), f.content);
    }
  }
  const apiIndex = grabbed.length ? await summarizeGrabbed(grabbed) : '';
  return { libFiles, apiIndex, grabbed };
}
