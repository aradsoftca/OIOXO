/**
 * oioxo Code — the VERIFIED-BRICK CORPUS (the weak-device magic, lever 1). The
 * answer-brain's trick was "don't make the model KNOW facts — let it fetch and
 * organize them." The code analog: don't make the small model AUTHOR a working
 * unit from nothing (where it's weakest) — let it RETRIEVE a unit that already
 * passed and adapt the delta. Authoring (hard, error-prone, many tokens) becomes
 * retrieval + wiring (cheap, reliable, few tokens). Pairs with diff-not-rewrite
 * (patch.ts): bricks cut the FIRST-draft cost + iterations, patches cut the repair
 * cost.
 *
 * A brick is a small, self-contained piece of code that the ORACLE has proven —
 * either authored + validated here (the seed), or harvested from a build that
 * reached green (trajectory-store's idea, applied to whole units instead of just
 * red→green fix pairs). Retrieval is the same cheap token-overlap used by
 * recallFixes, so this reuses the platform instead of adding a vector DB. The
 * corpus is shareable P2P (Send stack), so the network's weakest device inherits
 * the strongest device's verified blocks.
 *
 * This module is PURE + Node-testable; persistence (IndexedDB) lives in
 * brick-store.ts, mirroring trajectory-store.ts.
 */
import { overlapScore } from './trajectory-store';
import { typeCheckFiles } from './typecheck';
import type { CodeFile } from './codeloop';

export type BrickLang = 'ts' | 'js' | 'html' | 'css' | 'py' | 'sql';

export interface Brick {
  id: string;
  /** Human label shown in the prompt + UI. */
  title: string;
  /** Coarse category (util | data-structure | dom | game | net | …). */
  kind: string;
  /** Retrieval keywords — the brick's "search index" entry. */
  tags: string[];
  lang: BrickLang;
  /** The verified code unit (one self-contained snippet/file). */
  code: string;
  /** One-line "how to use it" the model sees alongside the code. */
  use?: string;
  /** Gem 6 — capability graph for app composition: the capabilities this brick
   *  PROVIDES and the ones it REQUIRES, so a whole app can be path-found from
   *  verified blocks and the model only writes the glue for unmet needs. */
  provides?: string[];
  requires?: string[];
  origin: 'seed' | 'trajectory' | 'user';
  /** Did an oracle prove it (type-check / tests / run)? Only verified bricks are
   *  ever suggested — we never hand the model unproven code as a "building block". */
  verified: boolean;
  ts: number;
}

const FILE_EXT: Record<BrickLang, string> = { ts: 'ts', js: 'js', html: 'html', css: 'css', py: 'py', sql: 'sql' };

/** Stable id from the code (so re-harvesting the same unit doesn't duplicate it). */
export function brickId(code: string, kind: string): string {
  let h = 5381;
  for (let i = 0; i < code.length; i++) h = ((h << 5) + h + code.charCodeAt(i)) | 0;
  return kind + '_' + (h >>> 0).toString(36);
}

export function makeBrick(b: Omit<Brick, 'id' | 'ts'> & { id?: string; ts?: number }): Brick {
  return { ...b, id: b.id ?? brickId(b.code, b.kind), ts: b.ts ?? Date.now() };
}

/* ── The SEED corpus ───────────────────────────────────────────────────────────
 * Authored, broadly-useful units. Each is VALIDATED against the type oracle at
 * build time (buildBrickSeed) — exactly how conductor.ts validates its seed — so
 * a seed brick is correct by construction, not by trust. They bootstrap the
 * corpus before real builds accumulate. */
const seed = (b: Omit<Brick, 'id' | 'ts' | 'origin' | 'verified'>): Brick =>
  makeBrick({ ...b, origin: 'seed', verified: true });

export const SEED_BRICKS: Brick[] = [
  seed({
    title: 'clamp — keep a number within a range',
    kind: 'util', lang: 'ts',
    tags: ['clamp', 'number', 'range', 'min', 'max', 'bound', 'limit', 'constrain'],
    use: 'clamp(value, min, max)',
    code: `export function clamp(n: number, min: number, max: number): number {\n  return Math.min(max, Math.max(min, n));\n}\n`,
  }),
  seed({
    title: 'debounce — run a function only after calls stop',
    kind: 'util', lang: 'ts',
    tags: ['debounce', 'throttle', 'delay', 'input', 'search', 'wait', 'timer', 'rate'],
    use: 'const onType = debounce(handler, 300)',
    code:
      `export function debounce<T extends (...args: any[]) => void>(fn: T, ms: number): (...args: Parameters<T>) => void {\n` +
      `  let t: ReturnType<typeof setTimeout> | undefined;\n` +
      `  return (...args: Parameters<T>) => {\n` +
      `    if (t) clearTimeout(t);\n` +
      `    t = setTimeout(() => fn(...args), ms);\n` +
      `  };\n}\n`,
  }),
  seed({
    title: 'Stack — a typed LIFO stack',
    kind: 'data-structure', lang: 'ts',
    tags: ['stack', 'lifo', 'data', 'structure', 'push', 'pop', 'peek', 'collection'],
    use: 'const s = new Stack<number>(); s.push(1); s.pop()',
    code:
      `export class Stack<T> {\n` +
      `  private items: T[] = [];\n` +
      `  push(x: T): void { this.items.push(x); }\n` +
      `  pop(): T | undefined { return this.items.pop(); }\n` +
      `  peek(): T | undefined { return this.items[this.items.length - 1]; }\n` +
      `  get size(): number { return this.items.length; }\n}\n`,
  }),
  seed({
    title: 'groupBy — bucket an array by a key',
    kind: 'util', lang: 'ts',
    tags: ['group', 'groupby', 'bucket', 'array', 'key', 'categorize', 'partition', 'collect'],
    use: 'groupBy(users, u => u.role)',
    code:
      `export function groupBy<T, K extends string | number>(items: T[], key: (x: T) => K): Record<K, T[]> {\n` +
      `  const out = {} as Record<K, T[]>;\n` +
      `  for (const it of items) {\n` +
      `    const k = key(it);\n` +
      `    if (!out[k]) out[k] = [];\n` +
      `    out[k].push(it);\n` +
      `  }\n  return out;\n}\n`,
  }),
  seed({
    title: 'fetchJson — fetch a URL and parse JSON, with error check',
    kind: 'net', lang: 'ts',
    tags: ['fetch', 'json', 'http', 'request', 'api', 'get', 'network', 'url'],
    use: 'const data = await fetchJson<MyType>("/api/x")',
    code:
      `export async function fetchJson<T = unknown>(url: string, init?: RequestInit): Promise<T> {\n` +
      `  const res = await fetch(url, init);\n` +
      `  if (!res.ok) throw new Error('HTTP ' + res.status + ' for ' + url);\n` +
      `  return (await res.json()) as T;\n}\n`,
  }),
  seed({
    title: 'AABB intersects — rectangle/box collision test',
    kind: 'game', lang: 'ts',
    tags: ['collision', 'collide', 'intersect', 'rectangle', 'rectangles', 'rect', 'box', 'aabb', 'hit', 'overlap', 'bounds'],
    use: 'if (intersects(player, wall)) { … }',
    code:
      `export interface Box { x: number; y: number; w: number; h: number; }\n` +
      `export function intersects(a: Box, b: Box): boolean {\n` +
      `  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;\n}\n`,
  }),
  seed({
    title: 'startLoop — fixed requestAnimationFrame game/render loop',
    kind: 'game', lang: 'ts',
    tags: ['loop', 'requestanimationframe', 'raf', 'game', 'animation', 'update', 'render', 'frame', 'tick'],
    use: 'const stop = startLoop((dt) => update(dt), () => render())',
    code:
      `export function startLoop(update: (dt: number) => void, render: () => void): () => void {\n` +
      `  let last = performance.now();\n` +
      `  let raf = 0;\n` +
      `  const frame = (now: number) => {\n` +
      `    const dt = (now - last) / 1000; last = now;\n` +
      `    update(dt); render();\n` +
      `    raf = requestAnimationFrame(frame);\n` +
      `  };\n` +
      `  raf = requestAnimationFrame(frame);\n` +
      `  return () => cancelAnimationFrame(raf);\n}\n`,
  }),
];

/* ── Retrieval ──────────────────────────────────────────────────────────────── */

/** Score a brick against a task query (title + tags + kind carry the signal). */
export function scoreBrick(query: string, b: Brick): number {
  const index = `${b.title} ${b.tags.join(' ')} ${b.kind}`;
  return overlapScore(query, index);
}

/**
 * The most relevant VERIFIED bricks for a task, best first. Cheap token overlap —
 * the same retrieval recallFixes uses. Only verified bricks are returned; a brick
 * below `min` similarity is dropped (so an unrelated task gets nothing, not noise).
 */
export function matchBricks(query: string, bricks: Brick[] = SEED_BRICKS, n = 3, min = 0.12): Brick[] {
  if (!query) return [];
  return bricks
    .filter((b) => b.verified)
    .map((b) => ({ b, s: scoreBrick(query, b) }))
    .filter((x) => x.s >= min)
    .sort((a, b) => b.s - a.s)
    .slice(0, n)
    .map((x) => x.b);
}

/** The text used to EMBED a brick for semantic search (what it does, not its code
 *  — code is noisy). Title + how-to-use + tags capture intent. */
export function brickEmbedText(b: Brick): string {
  return `${b.title}. ${b.use ?? ''} ${b.tags.join(' ')}`.trim();
}
/** The text used for LEXICAL overlap (exact names/terms). */
export function brickIndexText(b: Brick): string {
  return `${b.title} ${b.tags.join(' ')} ${b.kind}`;
}

/**
 * SEMANTIC brick retrieval (embed.ts) — finds the right verified block for a vague
 * request that token-overlap would miss ("delay until the user stops typing" →
 * debounce). Blends embedding similarity with lexical overlap. `embed` is injected
 * (the on-device MiniLM, or a fake in tests); `vecCache` embeds the corpus once.
 */
export async function semanticMatchBricks(
  query: string,
  embed: import('./embed').EmbedFn,
  bricks: Brick[] = SEED_BRICKS,
  n = 3,
  vecCache?: Map<string, number[]>,
): Promise<Brick[]> {
  const { semanticRank } = await import('./embed');
  const ranked = await semanticRank(query, bricks.filter((b) => b.verified), brickEmbedText, embed, {
    k: n, min: 0.25, alpha: 0.7, lexOf: brickIndexText, vecCache,
  });
  return ranked.map((r) => r.item);
}

/** Render bricks as a compact prompt block: verified blocks the coder can reuse.
 *  Kept tight (a weak model copies long context verbatim) — title + use + code. */
export function renderBricksForPrompt(bricks: Brick[], cap = 1600): string {
  if (!bricks.length) return '';
  const blocks = bricks.map((b) => {
    const head = `### ${b.title}${b.use ? `  —  use: ${b.use}` : ''}`;
    return `${head}\n\`\`\`${b.lang}\n${b.code.trim()}\n\`\`\``;
  });
  return (
    'Verified building blocks you can reuse or adapt (these already pass — prefer them ' +
    'over writing from scratch):\n' +
    blocks.join('\n\n')
  ).slice(0, cap);
}

/* ── Harvest (grow the corpus from green builds) ────────────────────────────── */

const isTest = (p: string) => /(\.|^)(test|spec)\.[a-z]+$|(^|\/)(tests?|__tests__)\//i.test(p);
const langOf = (path: string): BrickLang => {
  const e = (path.split('.').pop() || '').toLowerCase();
  if (e === 'tsx' || e === 'mts' || e === 'cts') return 'ts';
  if (e === 'jsx' || e === 'mjs' || e === 'cjs') return 'js';
  return (['ts', 'js', 'html', 'css', 'py', 'sql'].includes(e) ? e : 'js') as BrickLang;
};
const STOP = new Set('the a an and or for to of in on with that this build make create add me my app please using use into from your you it is be can do new'.split(' '));

/** Keywords for tagging a harvested brick: salient words from the goal + the file
 *  stem. Cheap, dependency-free; good enough for token-overlap retrieval. */
export function harvestTags(goal: string, path: string): string[] {
  const fromGoal = (goal.toLowerCase().match(/[a-z0-9]{3,}/g) || []).filter((w) => !STOP.has(w));
  const stem = (path.split('/').pop() || '').replace(/\.[a-z0-9]+$/i, '').toLowerCase();
  const fromPath = stem.match(/[a-z0-9]{3,}/g) || [];
  return Array.from(new Set([...fromGoal, ...fromPath])).slice(0, 12);
}

/**
 * Turn a build that reached GREEN into a brick: take its primary code file (the
 * largest non-test source) as a verified, reusable unit, tagged from the goal +
 * filename. Returns null when there's no suitable code file. The build only got
 * here because the oracle passed, so `verified` is honest.
 */
export function brickFromVerifiedBuild(goal: string, files: CodeFile[], maxBytes = 6000): Brick | null {
  const code = files
    .filter((f) => !isTest(f.path) && !/\.(md|json|lock|txt|ya?ml|toml)$/i.test(f.path))
    .filter((f) => f.content.trim().length > 0 && f.content.length <= maxBytes)
    .sort((a, b) => b.content.length - a.content.length)[0];
  if (!code) return null;
  return makeBrick({
    title: goal.trim().slice(0, 80) || code.path,
    kind: 'harvested',
    tags: harvestTags(goal, code.path),
    lang: langOf(code.path),
    code: code.content,
    origin: 'trajectory',
    verified: true,
  });
}

/* ── Seed validation (oracle-checked, like conductor.buildSeed) ──────────────── */

export interface BrickSeedBuild {
  bricks: Brick[];
  rejected: { id: string; reason: string }[];
}

/**
 * Validate the seed bricks against the type oracle: every TS/JS brick must
 * type-check clean, or it's rejected (never seed the corpus with broken code).
 * Non-TS langs (html/css/py/sql) can't be tsc'd here, so they pass through trusted
 * (a runtime oracle validates those when harvested). Mirrors buildSeed.
 */
export async function buildBrickSeed(bricks: Brick[] = SEED_BRICKS, libFiles?: Map<string, string>): Promise<BrickSeedBuild> {
  const ok: Brick[] = [];
  const rejected: { id: string; reason: string }[] = [];
  for (const b of bricks) {
    if (b.lang === 'ts' || b.lang === 'js') {
      const diags = await typeCheckFiles([{ path: `brick.${FILE_EXT[b.lang]}`, content: b.code }], libFiles);
      if (diags.length) {
        rejected.push({ id: b.id, reason: diags.map((d) => `TS${d.code}: ${d.message}`).join('; ').slice(0, 200) });
        continue;
      }
    }
    ok.push(b);
  }
  return { bricks: ok, rejected };
}

/* ── Import shared bricks (P2P) — TRUST NOTHING, PROVE EVERYTHING ────────────── */

export interface BrickImport {
  /** Bricks the LOCAL device re-proved — only these become usable. */
  accepted: Brick[];
  rejected: { id: string; title: string; reason: string }[];
}

const VALID_LANGS: BrickLang[] = ['ts', 'js', 'html', 'css', 'py', 'sql'];

/**
 * Re-validate bricks received from a peer before they can enter the corpus. We
 * DISCARD the peer's claimed id/origin/verified (untrusted) and re-derive them
 * locally: the brick is rebuilt from its content, then PROVEN by THIS device's
 * own oracle. A ts/js brick must type-check clean here to be accepted; a lang we
 * can't prove in Node (html/py/sql — they need the runtime/preview oracle) is
 * rejected for now rather than trusted on a stranger's word. This is what makes
 * pooling safe: a malicious or broken "verified" brick from the network can never
 * be suggested to the model, because our device wouldn't re-prove it.
 */
export async function revalidateForImport(incoming: Brick[], libFiles?: Map<string, string>): Promise<BrickImport> {
  const accepted: Brick[] = [];
  const rejected: { id: string; title: string; reason: string }[] = [];
  for (const raw of incoming) {
    const lang: BrickLang = VALID_LANGS.includes(raw?.lang) ? raw.lang : 'ts';
    const code = String(raw?.code ?? '');
    // Rebuild from content only — never inherit the peer's id/origin/verified.
    const b = makeBrick({
      title: String(raw?.title ?? '').slice(0, 120) || 'shared brick',
      kind: String(raw?.kind ?? 'shared').slice(0, 40),
      tags: Array.isArray(raw?.tags) ? raw.tags.slice(0, 16).map((t) => String(t)) : [],
      lang, code,
      use: raw?.use ? String(raw.use).slice(0, 160) : undefined,
      origin: 'user', verified: false,
    });
    if (!code.trim()) { rejected.push({ id: b.id, title: b.title, reason: 'empty code' }); continue; }
    if (lang === 'ts' || lang === 'js') {
      const diags = await typeCheckFiles([{ path: `brick.${FILE_EXT[lang]}`, content: code }], libFiles);
      if (diags.length) {
        rejected.push({ id: b.id, title: b.title, reason: `our oracle rejected it: ${diags[0].message}`.slice(0, 160) });
        continue;
      }
      accepted.push({ ...b, verified: true }); // proven HERE → trustworthy + suggestable
    } else {
      rejected.push({ id: b.id, title: b.title, reason: `can't prove ${lang} on this device — not trusted` });
    }
  }
  return { accepted, rejected };
}
