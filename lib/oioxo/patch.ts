/**
 * oioxo Code — DIFF-NOT-REWRITE (the weak-device magic). On a slow phone the loop
 * spends almost all its time in REPAIRS, and the cost of a repair is the model's
 * OUTPUT tokens × the device's tokens/sec. Reprinting a 400-line file to fix one
 * line is the real wall — not "is the model smart enough". So on repair the model
 * emits a tiny search/replace EDIT, and the device applies it. Generation cost
 * drops from O(file) to O(change): a 30-token patch instead of a 1400-token file.
 *
 * Same philosophy as the rest of oioxo: the model proposes the smallest possible
 * thing; the device does the exact, reliable work (here, locating + applying the
 * edit). Pure + Node-testable; the loop's internal representation stays full-file
 * (we hand `codeloop` complete `Edit`s) so nothing downstream changes.
 *
 * The format is the proven small-model one (Aider-style fenced search/replace):
 *
 *   *** path/to/file.ts        ← optional; omitted = the single target file
 *   <<<<<<< SEARCH
 *   exact lines copied from the file
 *   =======
 *   the corrected lines
 *   >>>>>>> REPLACE
 *
 * A weak model drifts on whitespace, so application is a tolerance LADDER (exact →
 * per-line trim → blank-insensitive). If a hunk still can't be located we REFUSE
 * it (never corrupt the file on a guess) and report the miss so the caller can
 * fall back to a whole-file rewrite — the patch is an optimization, never a risk.
 */
import type { CodeFile, Edit } from './codeloop';

/** One search/replace edit. `path` omitted → the caller's single target file. */
export interface Hunk {
  path?: string;
  search: string;
  replace: string;
}

const nl = (s: string) => s.replace(/\r\n/g, '\n');

// Tolerant markers: models vary the count of </=/> and the casing/spacing.
const BLOCK =
  /<{3,}\s*SEARCH\s*\n([\s\S]*?)\n?={3,}[ \t]*\n([\s\S]*?)\n?>{3,}\s*REPLACE/gi;

/** Does a line look like a file path we should attach a hunk to? */
function looksPath(s: string): boolean {
  const t = s.replace(/^\*+\s*/, '').replace(/\*+$/, '').replace(/[`"']/g, '').trim();
  return /[\w-]+\.[a-z0-9]+$/i.test(t) && !/\s/.test(t) && !/^https?:/i.test(t);
}
function cleanPath(s: string): string {
  return s.replace(/^\*+\s*/, '').replace(/\*+$/, '').replace(/[`"']/g, '').replace(/^[-*•]\s*/, '').trim();
}

/** Find the nearest path declaration in the text PRECEDING a block (a `*** file`
 *  line, a ```file fence, a **file** label, or a bare path line). */
function trailingPath(text: string): string | undefined {
  const lines = text.split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    const raw = lines[i].trim();
    if (!raw) continue;
    const fence = raw.match(/^```+\s*([\w./-]+\.[a-z0-9]+)\s*$/i);
    if (fence) return fence[1];
    if (looksPath(raw)) return cleanPath(raw);
    // a non-path, non-empty line breaks the association (avoid grabbing prose far above)
    if (raw.length > 0 && !/^[*#>\s-]*$/.test(raw)) break;
  }
  return undefined;
}

/**
 * Parse search/replace hunks out of a model reply. `defaultPath` is used for any
 * hunk with no path marker (the single-target repair case). Pure.
 */
export function parsePatches(reply: string, defaultPath?: string): Hunk[] {
  const text = nl(reply);
  const out: Hunk[] = [];
  let m: RegExpExecArray | null;
  let prev = 0;
  BLOCK.lastIndex = 0;
  while ((m = BLOCK.exec(text))) {
    const before = text.slice(prev, m.index);
    prev = BLOCK.lastIndex;
    const path = trailingPath(before) ?? defaultPath;
    out.push({ path, search: m[1], replace: m[2] });
  }
  return out;
}

/* ── Constrained JSON edits (Gem 1: make a malformed repair impossible) ───────
 * A weak model often answers a repair in PROSE, which the marker parser can't use
 * and a naive fallback would mis-apply. So we also accept (and, with json_object
 * constrained decoding, REQUIRE) a structured edit list:
 *
 *   {"edits":[{"find":"<exact lines>","replace":"<new lines>","path":"<opt>"}]}
 *
 * JSON is trivially parseable and the decoder can be constrained to it, so the
 * model literally cannot emit prose-instead-of-a-patch. Tolerant: also accepts a
 * bare array, and common field aliases (search/old/from, with/new/to, file). */
export function parseJsonEdits(reply: string, defaultPath?: string): Hunk[] {
  const raw = extractJson(reply);
  if (raw == null) return [];
  let data: unknown;
  try { data = JSON.parse(raw); } catch { return []; }
  const arr: unknown[] = Array.isArray(data)
    ? data
    : (data && typeof data === 'object' && Array.isArray((data as Record<string, unknown>).edits))
      ? ((data as Record<string, unknown>).edits as unknown[])
      : [];
  const out: Hunk[] = [];
  for (const it of arr) {
    if (!it || typeof it !== 'object') continue;
    const o = it as Record<string, unknown>;
    const search = String(o.find ?? o.search ?? o.old ?? o.from ?? '');
    if (!search) continue;
    const replace = String(o.replace ?? o.with ?? o.new ?? o.to ?? '');
    const path = o.path ?? o.file;
    out.push({ path: typeof path === 'string' ? path : defaultPath, search, replace });
  }
  return out;
}

/** Pull the first JSON object/array out of a reply (handles ```json fences + a
 *  little surrounding prose). Returns null when there's no JSON-looking span. */
function extractJson(reply: string): string | null {
  const t = reply.trim();
  if (t.startsWith('{') || t.startsWith('[')) return t;
  const obj = t.match(/\{[\s\S]*\}/);
  const arrm = t.match(/\[[\s\S]*\]/);
  // Prefer whichever appears first.
  if (obj && arrm) return obj.index! <= arrm.index! ? obj[0] : arrm[0];
  return (obj ?? arrm)?.[0] ?? null;
}

/** Parse a repair reply by ANY supported shape: JSON edits first (the constrained
 *  format), then the SEARCH/REPLACE markers. The first that yields hunks wins. */
export function parseAnyPatch(reply: string, defaultPath?: string): Hunk[] {
  const json = parseJsonEdits(reply, defaultPath);
  if (json.length) return json;
  return parsePatches(reply, defaultPath);
}

/** Replace the FIRST exact occurrence of `search` with `replace`. */
function exactReplace(content: string, search: string, replace: string): string | null {
  const i = content.indexOf(search);
  if (i < 0) return null;
  return content.slice(0, i) + replace + content.slice(i + search.length);
}

function trimBlock(lines: string[]): string[] {
  const a = [...lines];
  while (a.length && !a[0].trim()) a.shift();
  while (a.length && !a[a.length - 1].trim()) a.pop();
  return a;
}

/** Match a contiguous window of lines comparing TRIMMED text (tolerates the
 *  model getting indentation / trailing whitespace wrong — the common drift). */
function windowReplace(content: string, search: string, replace: string): string | null {
  const cl = content.split('\n');
  const sl = trimBlock(search.split('\n'));
  if (!sl.length) return null;
  const want = sl.map((s) => s.trim());
  for (let start = 0; start + want.length <= cl.length; start++) {
    let ok = true;
    for (let j = 0; j < want.length; j++) {
      if (cl[start + j].trim() !== want[j]) { ok = false; break; }
    }
    if (ok) {
      const out = [...cl.slice(0, start), ...replace.split('\n'), ...cl.slice(start + want.length)];
      return out.join('\n');
    }
  }
  return null;
}

/** Last resort: match the search lines IGNORING blank lines, then replace the
 *  whole span (first→last matched line). Handles a model dropping/adding blanks
 *  inside the block. Still anchored to real lines, so it can't run away. */
function looseReplace(content: string, search: string, replace: string): string | null {
  const cl = content.split('\n');
  const want = search.split('\n').map((s) => s.trim()).filter(Boolean);
  if (!want.length) return null;
  const idx: number[] = [];
  const tr: string[] = [];
  cl.forEach((l, i) => { const t = l.trim(); if (t) { idx.push(i); tr.push(t); } });
  for (let k = 0; k + want.length <= tr.length; k++) {
    let ok = true;
    for (let j = 0; j < want.length; j++) {
      if (tr[k + j] !== want[j]) { ok = false; break; }
    }
    if (ok) {
      const start = idx[k];
      const end = idx[k + want.length - 1];
      const out = [...cl.slice(0, start), ...replace.split('\n'), ...cl.slice(end + 1)];
      return out.join('\n');
    }
  }
  return null;
}

export interface ApplyResult {
  content: string;
  applied: number;
  failed: number;
}

/**
 * Apply hunks to one file's content, in order, via the tolerance ladder. Each
 * hunk runs against the running content (so sequential edits compound). A hunk
 * that can't be located is skipped (never force-applied) and counted in `failed`.
 */
export function applyHunks(content: string, hunks: Hunk[]): ApplyResult {
  let cur = nl(content);
  let applied = 0;
  let failed = 0;
  for (const h of hunks) {
    const search = nl(h.search);
    const replace = nl(h.replace);
    // Empty SEARCH = "this is the whole/new file" → full replace.
    if (!search.trim()) { cur = replace; applied++; continue; }
    const next =
      exactReplace(cur, search, replace) ??
      windowReplace(cur, search, replace) ??
      looseReplace(cur, search, replace);
    if (next == null) { failed++; continue; }
    cur = next;
    applied++;
  }
  return { content: cur, applied, failed };
}

export interface PatchEdits {
  /** Full-file edits ready for codeloop's applyEdits (replace by path). */
  edits: Edit[];
  /** Hunks successfully located + applied. */
  applied: number;
  /** Hunks that couldn't be located (caller may fall back to whole-file). */
  failed: number;
}

/**
 * Turn a model's patch reply into full-file `Edit`s against the current project.
 * Groups hunks by path (defaulting to `target` for path-less hunks), applies each
 * file's hunks, and emits a full-file Edit only for files that actually changed.
 *
 * This is the bridge: the MODEL emitted a tiny patch (cheap), but `codeloop`
 * still receives complete file contents (unchanged contract). If nothing applied,
 * `edits` is empty and the caller falls back to whole-file generation.
 */
export function applyPatchReply(reply: string, files: CodeFile[], target?: string): PatchEdits {
  const only = files.length === 1 ? files[0].path : undefined;
  const def = target ?? only;
  const hunks = parseAnyPatch(reply, def);
  if (!hunks.length) return { edits: [], applied: 0, failed: 0 };

  const byPath = new Map<string, Hunk[]>();
  for (const h of hunks) {
    const p = h.path ?? def;
    if (!p) continue; // no path and no default → can't place it
    (byPath.get(p) ?? byPath.set(p, []).get(p)!).push(h);
  }

  const current = new Map(files.map((f) => [f.path, nl(f.content)]));
  const edits: Edit[] = [];
  let applied = 0;
  let failed = 0;
  for (const [path, hs] of byPath) {
    const base = current.get(path) ?? ''; // unknown path → treat as a new file
    const res = applyHunks(base, hs);
    applied += res.applied;
    failed += res.failed;
    if (res.content !== base) edits.push({ path, content: res.content.replace(/\n+$/, '\n') });
  }
  return { edits, applied, failed };
}

/** Rough token estimate (≈ chars/4) — for measuring the patch vs whole-file cost
 *  saving in demos/telemetry. Good enough for a relative comparison. */
export function estimateTokens(s: string): number {
  return Math.ceil(s.length / 4);
}
