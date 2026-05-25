/**
 * oioxo Code — the GENERATOR side of the loop (OIOXO_CODE.md §2 step 3). Prompts
 * the on-device coder (web-llm, e.g. Qwen2.5-Coder) for the SMALLEST change that
 * satisfies the task or fixes the last error, and parses its reply into file
 * edits the loop can apply. The model proposes; the device (codeloop + runner)
 * proves. Parsing is pure + Node-testable; only the model call needs the browser.
 */
import type { Edit, GenContext, GenerateFn } from './codeloop';
import { chat } from './runtime';
import { retrieveContext, type RetrievedContext } from './retrieve';

// The skill model match (resolved against web-llm's live catalog by substring).
const CODER = ['Qwen2.5-Coder', 'Coder', 'Qwen2.5'];

// No fill-in slots: a tiny model copies a `<full file contents>` placeholder
// verbatim, so the format is taught with a COMPLETE example instead (see the
// multi-file prompt). The single-file path below removes path choices entirely.
export const SYSTEM =
  'You are a coding agent in a sandbox. You write and fix code so the tests pass.\n' +
  'Reply with ONLY code — no explanation, no prose. Output the COMPLETE new contents\n' +
  'of each source file you change. Never output or edit a test file. Keep the file\'s\n' +
  'existing module style (ES `import`/`export` vs CommonJS `require`) and language.';

const isTest = (p: string) => /(\.|^)(test|spec)\.[a-z]+$|(^|\/)(tests?|__tests__)\//i.test(p);

/** The editable source files (everything that isn't a test). */
export function editableSources<T extends { path: string }>(files: T[]): T[] {
  return files.filter((f) => !isTest(f.path));
}

// Docs / config / lockfiles aren't "the code the model edits" — they shouldn't
// count toward the single-vs-multi decision (a project of index.html + README is
// still a one-file edit). Excluding them lets the proven single-target path apply
// to the common "one code file + docs/config + tests" shape.
const NON_CODE = /\.(md|markdown|txt|json|lock|toml|ya?ml|cfg|ini|env)$|(^|\/)(license|readme|\.gitignore|package-lock\.json|yarn\.lock|pnpm-lock\.yaml)$/i;

/** The primary editable CODE files (sources, minus tests, docs, config, locks). */
export function codeFiles<T extends { path: string }>(files: T[]): T[] {
  return editableSources(files).filter((f) => !NON_CODE.test(f.path));
}

/** When there's exactly ONE primary code file we drive a constrained
 *  single-target prompt (no path choices for the model) — returns that path. */
export function singleTarget(files: { path: string }[]): string | undefined {
  const code = codeFiles(files);
  return code.length === 1 ? code[0].path : undefined;
}

function fence(content: string, cap = 8000): string {
  const body = content.length > cap ? content.slice(0, cap) + '\n…(truncated)…' : content;
  return '```\n' + body + '\n```';
}

function renderFiles(files: { path: string; content: string }[], cap = 8000): string {
  let out = '';
  for (const f of files) {
    const body = f.content.length > cap ? f.content.slice(0, cap) + '\n…(truncated)…' : f.content;
    out += `--- ${f.path} ---\n${body}\n\n`;
  }
  return out.trim() || '(empty project)';
}

/** Build the user message for a draft (attempt 0) or a repair (attempt ≥1).
 *
 *  Two shapes, chosen by how many editable source files exist:
 *  - ONE source file (the common repair case) → a tightly constrained prompt: show
 *    that file + the spec/error, ask only for its corrected contents. The model
 *    never picks a path, so a tiny model can't drift or invent one. The test is
 *    shown as read-only spec; the parser maps the reply straight back to the file
 *    and refuses to overwrite source with test code.
 *  - MANY files → the labelled-block prompt (a COMPLETE example, not a fill-in slot).
 */
export function buildPrompt(ctx: GenContext, retrieved?: RetrievedContext, extApis?: string): string {
  const shown = retrieved?.relevantFiles ?? ctx.files;
  const src = editableSources(shown);
  const tests = shown.filter((f) => isTest(f.path));
  const apis = retrieved?.symbolIndex
    ? `Project APIs (exact signatures — call these, do NOT invent names):\n${retrieved.symbolIndex.slice(0, 4000)}\n\n`
    : '';
  const ext = extApis ? `External libraries (fetched — use these REAL APIs, do NOT guess):\n${extApis.slice(0, 4000)}\n\n` : '';

  // ── Single-file: no path choices, no labels, just "here is the file, fix it".
  // We deliberately do NOT paste the test source: a tiny model parrots the most
  // complete-looking code in the prompt, so showing the test makes it echo the
  // test. Instead it gets the source + the real run error (actual vs expected),
  // which is the signal it needs and can't copy into a wrong answer. The decision
  // matches singleTarget() so the prompt shape and the parser always agree. ──
  const target = singleTarget(shown);
  if (target) {
    const f = src.find((s) => s.path === target)!;
    const head = `SOURCE — edit this file (${f.path}):\n${fence(f.content)}\n\n`;
    const tail = `Output ONLY the complete corrected contents of ${f.path} as code. Do not output the test. Do not explain.`;
    if (ctx.attempt === 0 || !ctx.error) {
      return `Task: ${ctx.task}\n\n${ext}${apis}${head}${tail}`;
    }
    return `Task: ${ctx.task}\n\n${ext}${apis}${head}Running the tests FAILED with:\n${ctx.error}\n\nThe bug is in ${f.path}. Make the smallest change that fixes it. ${tail}`;
  }

  // ── Many files: ask for labelled blocks. NO code example — a tiny model copies
  // any example verbatim instead of doing the task — so the format is described
  // in words only. ──
  const srcBlock = src.length ? `SOURCE files (edit ONLY these):\n${renderFiles(src)}\n\n` : '';
  const testBlock = tests.length ? `TESTS (read-only — your code must make these pass; do NOT edit them):\n${renderFiles(tests)}\n\n` : '';
  const fmt =
    'For each file you write, put the file path immediately after the opening triple backticks ' +
    '(e.g. three backticks then index.html on the same line), then the file\'s COMPLETE real code, ' +
    'then closing triple backticks. Write the real code for THIS task — do not copy any example. No prose.';
  if (ctx.attempt === 0 || !ctx.error) {
    return `Task: ${ctx.task}\n\n${ext}${apis}${srcBlock}${testBlock}Write or edit the SOURCE file(s) to do this.\n${fmt}`;
  }
  return `Task: ${ctx.task}\n\n${ext}${apis}${srcBlock}${testBlock}It FAILED with:\n${ctx.error}\n\nFix the bug in a SOURCE file (not the tests).\n${fmt}`;
}

const LANG_EXT: Record<string, string> = {
  html: 'html', htm: 'html', js: 'js', javascript: 'js', mjs: 'js', jsx: 'jsx',
  ts: 'ts', typescript: 'ts', tsx: 'tsx', css: 'css', json: 'json', py: 'py',
  python: 'py', sql: 'sql', md: 'md', markdown: 'md',
};
const DEFAULT_FILE: Record<string, string> = {
  html: 'index.html', css: 'style.css', js: 'script.js', jsx: 'src/App.jsx',
  ts: 'index.ts', tsx: 'src/App.tsx', py: 'main.py', sql: 'main.sql', json: 'data.json', md: 'README.md',
};

/** Map a language-only fence (```js / ```html) to the file it most likely targets,
 *  using the existing project files (weak models rarely put the PATH on the fence —
 *  so we infer it instead of throwing the code away). */
function pathForLang(lang: string, project: { path: string }[]): string | null {
  const ext = LANG_EXT[lang.toLowerCase()];
  if (!ext) return null;
  const cands = project.filter((f) => f.path.toLowerCase().endsWith('.' + ext));
  if (cands.length === 1) return cands[0].path;
  if (cands.length > 1) {
    const pref = cands.find((f) => /(?:^|\/)(index|main|game|app|script)\.[a-z]+$/i.test(f.path));
    return (pref ?? cands[0]).path;
  }
  return DEFAULT_FILE[ext] ?? null; // none yet → create the conventional file
}

/** Does this code look like a TEST file (so we must never write it into source)? */
const looksLikeTest = (s: string) =>
  /from\s+['"]node:test['"]|require\(\s*['"](?:node:)?(?:assert|test)['"]\s*\)|\b(?:describe|it|test)\s*\(\s*['"`]/.test(s);

/** Pull the one source body out of a single-target reply: the largest fenced
 *  block, else the whole reply. Strips a leading `path`/`lang` info line and
 *  rejects placeholder echoes (e.g. "<full file contents>"). */
function extractSingleBody(reply: string): string {
  let best = '';
  let m: RegExpExecArray | null;
  const fence = /```[^\n`]*\n([\s\S]*?)```/g;
  while ((m = fence.exec(reply))) if (m[1].length > best.length) best = m[1];
  const body = (best || reply).trim();
  if (!body) return '';
  if (/^<[^>]*>$/.test(body)) return ''; // copied a "<full file contents>" placeholder
  return body;
}

/**
 * Parse a model reply into file edits.
 *
 * Single-target mode (`target` given — exactly one editable source): the model
 * was asked NOT to choose a path, so we ignore any path it invents and map its
 * code straight onto `target`, refusing test code (never corrupt source with a
 * copied test). This is what makes a tiny model reliable on the repair case.
 *
 * Otherwise: a fenced block whose info line is a PATH (```src/add.js); a
 * `// path:` / `# x.py` header inside the block; a LANGUAGE-only fence
 * (```js, ```html) mapped to the project file it targets; or, as a last resort,
 * an unfenced whole-file reply mapped to the single relevant project file. Pure.
 */
export function parseEdits(reply: string, project: { path: string }[] = [], target?: string): Edit[] {
  if (target) {
    const body = extractSingleBody(reply);
    if (!body || looksLikeTest(body)) return [];
    return [{ path: target, content: body.replace(/\n+$/, '\n') }];
  }
  const edits: Edit[] = [];
  const seen = new Set<string>();
  const fence = /```([^\n`]*)\n([\s\S]*?)```/g;
  const looksPath = (s: string) => /[/.]/.test(s) && !/\s/.test(s) && /[a-z0-9]/i.test(s) && !(s.toLowerCase() in LANG_EXT) && !/^(sh|bash|txt|shell|console|bnf)$/i.test(s);
  let m: RegExpExecArray | null;
  let sawFence = false;
  while ((m = fence.exec(reply))) {
    sawFence = true;
    let path = (m[1] || '').trim();
    let content = m[2];
    if (!looksPath(path)) {
      const head = content.split('\n')[0].trim();
      const hm = head.match(/^(?:\/\/|#|<!--)\s*(?:file:\s*|path:\s*)?([\w./-]+\.[\w]+)/i);
      if (hm && looksPath(hm[1])) {
        path = hm[1];
        content = content.split('\n').slice(1).join('\n');
      } else {
        // language-only / blank fence → infer the target file from the project
        const inferred = pathForLang(path || guessLang(content), project);
        if (!inferred) continue;
        path = inferred;
      }
    }
    if (seen.has(path)) continue;
    seen.add(path);
    edits.push({ path, content: content.replace(/\n+$/, '\n') });
  }
  // No fences at all but the reply is clearly a whole file → map to the one
  // relevant project file (weak models sometimes skip fences entirely).
  if (!sawFence && /<!doctype|<html|function |const |class |def |=>|import /i.test(reply) && reply.trim().length > 40) {
    const path = pathForLang(guessLang(reply), project);
    if (path) edits.push({ path, content: reply.trim().replace(/\n+$/, '\n') });
  }
  return edits;
}

/** Best-effort language guess from content (for fences with no info string). */
function guessLang(s: string): string {
  if (/<!doctype|<html|<body|<canvas/i.test(s)) return 'html';
  if (/^\s*[.#@]?[\w-]+\s*\{[^}]*:[^}]*\}/m.test(s) && !/function|=>/.test(s)) return 'css';
  if (/\bdef \w+\(|^\s*import \w+$|print\(/m.test(s)) return 'py';
  if (/\b(SELECT|CREATE TABLE|INSERT INTO)\b/i.test(s)) return 'sql';
  return 'js';
}

/** A GenerateFn backed by the on-device coder. `match` selects the installed
 *  model (defaults to a Qwen2.5-Coder); loads/caches on first use. `getExtApis`
 *  supplies grabbed external-library signatures (P4), re-read each call so APIs
 *  fetched mid-loop reach the next draft. */
export function makeCoderGenerate(
  match: string[] = CODER,
  opts: { onProgress?: (p: number) => void; getExtApis?: () => string } = {},
): GenerateFn {
  return async (ctx: GenContext): Promise<Edit[]> => {
    const retrieved = await retrieveContext(ctx.task, ctx.files).catch(() => undefined);
    const reply = await chat(
      match,
      [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: buildPrompt(ctx, retrieved, opts.getExtApis?.()) },
      ],
      // Enough spread that best-of-N candidates genuinely differ (a near-greedy
      // repair just reprints the source) — the proven weak-model recipe.
      { onProgress: opts.onProgress, maxTokens: 1400, temperature: ctx.attempt === 0 ? 0.5 : 0.4 },
    );
    return parseEdits(reply, ctx.files, singleTarget(retrieved?.relevantFiles ?? ctx.files));
  };
}
