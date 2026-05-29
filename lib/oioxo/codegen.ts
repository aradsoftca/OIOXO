/**
 * oioxo Code — the GENERATOR side of the loop (OIOXO_CODE.md §2 step 3). Prompts
 * the on-device coder (web-llm, e.g. Qwen2.5-Coder) for the SMALLEST change that
 * satisfies the task or fixes the last error, and parses its reply into file
 * edits the loop can apply. The model proposes; the device (codeloop + runner)
 * proves. Parsing is pure + Node-testable; only the model call needs the browser.
 */
import type { Edit, GenContext, GenerateFn } from './codeloop';
import { chat, chatStream } from './runtime';
import { retrieveContext, type RetrievedContext } from './retrieve';
import { applyPatchReply } from './patch';

// The skill model match (resolved against web-llm's live catalog by substring).
const CODER = ['Qwen2.5-Coder', 'Coder', 'Qwen2.5'];

// No fill-in slots: a tiny model copies a `<full file contents>` placeholder
// verbatim, so the format is taught with a COMPLETE example instead (see the
// multi-file prompt). The single-file path below removes path choices entirely.
export const SYSTEM =
  'You are a coding agent in a sandbox. You write and fix code so the tests pass.\n' +
  'Reply with ONLY code — no explanation, no prose. Output the COMPLETE new contents\n' +
  'of each source file you change. Never output or edit a test file. Keep the file\'s\n' +
  'existing module style (ES `import`/`export` vs CommonJS `require`) and language.\n' +
  'For a web page or browser GAME: put ALL the HTML, CSS and JavaScript in index.html\n' +
  'using PLAIN browser JavaScript inside a <script> tag — do NOT create separate .js/.ts\n' +
  'files, do NOT use TypeScript or imports, so it runs immediately with no build step.';

// DIFF-NOT-REWRITE (patch.ts): on a REPAIR the model edits, it doesn't re-author.
// A search/replace block costs a handful of tokens instead of a whole file — the
// difference between seconds and minutes on a weak device. The device locates and
// applies the edit (exact → fuzzy), so the small model only has to point at the
// bug and say what it should be.
// Gem 1 — CONSTRAINED REPAIR. The repair reply is a JSON edit list, and the
// decoder is constrained to json_object (runtime ChatOpts.responseFormat), so a
// weak model CANNOT answer in prose (the failure that corrupted a file in the
// live test). Each edit = the exact lines to find + their replacement; the device
// locates + applies them (exact→fuzzy via patch.ts). Tiny output, impossible to
// mis-shape. The SEARCH/REPLACE markers still parse as a fallback (parseAnyPatch).
export const PATCH_SYSTEM =
  'You are a coding agent fixing a bug. Do NOT reprint the whole file. Reply with\n' +
  'ONLY a JSON object of edits, nothing else:\n' +
  '{"edits":[{"find":"<exact lines copied from the file, incl. the buggy line>","replace":"<those lines, corrected>"}]}\n' +
  'Copy the "find" text EXACTLY as it appears in the file. Change as little as possible.';

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
export function buildPrompt(ctx: GenContext, retrieved?: RetrievedContext, extApis?: string, bricks?: string): string {
  const shown = retrieved?.relevantFiles ?? ctx.files;
  const src = editableSources(shown);
  const tests = shown.filter((f) => isTest(f.path));
  const apis = retrieved?.symbolIndex
    ? `Project APIs (exact signatures — call these, do NOT invent names):\n${retrieved.symbolIndex.slice(0, 4000)}\n\n`
    : '';
  const ext = extApis ? `External libraries (fetched — use these REAL APIs, do NOT guess):\n${extApis.slice(0, 4000)}\n\n` : '';
  // VERIFIED-BRICK CORPUS (bricks.ts): proven building blocks for this task. A weak
  // model adapts these instead of authoring from nothing — fewer tokens, far higher
  // first-draft correctness. Empty when nothing relevant, so no bloat.
  const brk = bricks ? `${bricks}\n\n` : '';

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
      return `Task: ${ctx.task}\n\n${brk}${ext}${apis}${head}${tail}`;
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
    return `Task: ${ctx.task}\n\n${brk}${ext}${apis}${srcBlock}${testBlock}Write or edit the SOURCE file(s) to do this.\n${fmt}`;
  }
  return `Task: ${ctx.task}\n\n${ext}${apis}${srcBlock}${testBlock}It FAILED with:\n${ctx.error}\n\nFix the bug in a SOURCE file (not the tests).\n${fmt}`;
}

/** Build the REPAIR prompt that asks for a search/replace PATCH (not a rewrite).
 *  Shows the current source + the run error; the model points at the bug. Single
 *  target → path-less edits (parser maps them to it); many files → ask for a
 *  `*** path` line before each edit so the patch lands on the right file. */
export function buildPatchRepairPrompt(ctx: GenContext, retrieved?: RetrievedContext, extApis?: string): string {
  const shown = retrieved?.relevantFiles ?? ctx.files;
  const src = editableSources(shown);
  const apis = retrieved?.symbolIndex
    ? `Project APIs (exact signatures — call these, do NOT invent names):\n${retrieved.symbolIndex.slice(0, 4000)}\n\n`
    : '';
  const ext = extApis ? `External libraries (fetched — use these REAL APIs):\n${extApis.slice(0, 4000)}\n\n` : '';
  const target = singleTarget(shown);
  if (target) {
    const f = src.find((s) => s.path === target)!;
    return (
      `Task: ${ctx.task}\n\n${ext}${apis}` +
      `Current contents of ${f.path}:\n${fence(f.content)}\n\n` +
      `Running the tests FAILED with:\n${ctx.error}\n\n` +
      `Return JSON edits that fix ${f.path}: {"edits":[{"find":"…","replace":"…"}]}. Do not reprint the whole file.`
    );
  }
  return (
    `Task: ${ctx.task}\n\n${ext}${apis}` +
    `SOURCE files:\n${renderFiles(src)}\n\n` +
    `It FAILED with:\n${ctx.error}\n\n` +
    `Return JSON edits that fix it: {"edits":[{"path":"<file>","find":"…","replace":"…"}]}. ` +
    `Include "path" for each edit. Do not edit tests. Do not reprint whole files.`
  );
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
 *  rejects placeholder echoes (e.g. "<full file contents>").
 *
 *  CRITICAL: a weak model often answers a REPAIR in PROSE ("Replace `ms` with a
 *  number") instead of code. With no fence we must NOT treat that prose as the new
 *  file — that overwrites working code with an explanation. So when there's no
 *  fenced block, we only accept the reply if it actually looks like source
 *  (structural chars / a tag), else return '' so the caller makes no edit and the
 *  loop retries. (Found by the live 0.5B-coder run, which corrupted a file this way.) */
function extractSingleBody(reply: string): string {
  let best = '';
  let sawFence = false;
  let m: RegExpExecArray | null;
  const fence = /```[^\n`]*\n([\s\S]*?)```/g;
  while ((m = fence.exec(reply))) { sawFence = true; if (m[1].length > best.length) best = m[1]; }
  const body = (best || reply).trim();
  if (!body) return '';
  if (/^<[^>]*>$/.test(body)) return ''; // copied a "<full file contents>" placeholder
  // No fence + not code-shaped → it's prose, not a file. Don't overwrite with it.
  if (!sawFence && !/[{};]|=>|<\/?[a-z]/i.test(body)) return '';
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
const looksPath = (s: string) => /[/.]/.test(s) && !/\s/.test(s) && /[a-z0-9]/i.test(s) && !(s.toLowerCase() in LANG_EXT) && !/^(sh|bash|txt|shell|console|bnf)$/i.test(s);

/** Pull a filename out of a possibly-messy fence info line: "typescript // index.html",
 *  "ts src/game.ts", "index.html" → the path token, else null. (A weak model often
 *  jams the language AND a path/comment onto the ``` line.) */
function pathFromInfo(info: string): string | null {
  const m = info.match(/[\w./-]+\.[a-z0-9]+/i);
  return m && looksPath(m[0]) ? m[0] : null;
}

/** Strip stray markdown code fences a model may wrap content in — a leading
 *  ```lang line and a trailing ``` (with anything after). This is the fix for the
 *  "```typescript // index.html" garbage leaking in as the file's contents when a
 *  fence is malformed/incomplete and the raw reply is used. */
function stripFences(s: string): string {
  return s.replace(/^\s*```[^\n]*\n/, '').replace(/\n```[\s\S]*$/, '').replace(/^\s*```\s*$/m, '').trim();
}

export function parseEdits(reply: string, project: { path: string }[] = [], target?: string): Edit[] {
  if (target) {
    const body = extractSingleBody(reply);
    if (!body || looksLikeTest(body)) return [];
    return [{ path: target, content: stripFences(body).replace(/\n+$/, '\n') + '\n' }];
  }
  const edits: Edit[] = [];
  const seen = new Set<string>();
  const fence = /```([^\n`]*)\n([\s\S]*?)```/g;
  let m: RegExpExecArray | null;
  let sawFence = false;
  while ((m = fence.exec(reply))) {
    sawFence = true;
    const info = (m[1] || '').trim();
    let path = '';
    let content = m[2];
    if (looksPath(info)) {
      path = info;
    } else if (pathFromInfo(info)) {
      // messy info line ("typescript // index.html") → take the filename token.
      path = pathFromInfo(info)!;
    } else {
      const head = content.split('\n')[0].trim();
      const hm = head.match(/^(?:\/\/|#|<!--)\s*(?:file:\s*|path:\s*)?([\w./-]+\.[\w]+)/i);
      if (hm && looksPath(hm[1])) {
        path = hm[1];
        content = content.split('\n').slice(1).join('\n');
      } else {
        // language-only / blank fence → infer the target file from the project
        const inferred = pathForLang(info.split(/\s+/)[0] || guessLang(content), project);
        if (!inferred) continue;
        path = inferred;
      }
    }
    content = stripFences(content);
    if (seen.has(path) || !content) continue;
    seen.add(path);
    edits.push({ path, content: content.replace(/\n+$/, '\n') + '\n' });
  }
  // No COMPLETE fence (maybe an incomplete/cut-off one) but the reply is clearly a
  // whole file → strip any stray fence and map it to the relevant project file.
  if (!sawFence && /<!doctype|<html|function |const |class |def |=>|import /i.test(reply) && reply.trim().length > 40) {
    const path = pathForLang(guessLang(reply), project);
    const content = stripFences(reply);
    if (path && content) edits.push({ path, content: content.replace(/\n+$/, '\n') + '\n' });
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
  opts: {
    onProgress?: (p: number) => void;
    getExtApis?: () => string;
    /** VERIFIED-BRICK CORPUS (brick-store.recallBricks): proven blocks for the task,
     *  folded into the DRAFT so a weak model adapts instead of authoring. Injected
     *  (async, IndexedDB) so codegen stays pure + Node-testable. */
    recallBricks?: (query: string) => Promise<string>;
    /** VISIBILITY: stream the DRAFT as the model writes it (delta + running text +
     *  the file it's writing) so the UI shows live progress instead of a frozen
     *  spinner. Repairs stay on the constrained (non-streaming) JSON path. */
    onToken?: (info: { delta: string; full: string; path?: string; attempt: number }) => void;
  } = {},
): GenerateFn {
  return async (ctx: GenContext): Promise<Edit[]> => {
    const retrieved = await retrieveContext(ctx.task, ctx.files).catch(() => undefined);
    const shown = retrieved?.relevantFiles ?? ctx.files;
    const target = singleTarget(shown);
    const extApis = opts.getExtApis?.();

    // First draft → author whole files (there's nothing to patch yet). Repairs →
    // DIFF-NOT-REWRITE: ask for a search/replace edit, far cheaper on a weak
    // device. maxTokens shrinks to match (a patch is small), so the model can't
    // burn minutes reprinting the file.
    const repair = ctx.attempt > 0 && !!ctx.error;
    // Pull relevant verified bricks only for the draft (where authoring happens).
    const bricks = repair ? '' : await opts.recallBricks?.(ctx.task).catch(() => '') ?? '';
    const messages = [
      { role: 'system' as const, content: repair ? PATCH_SYSTEM : SYSTEM },
      {
        role: 'user' as const,
        content: repair
          ? buildPatchRepairPrompt(ctx, retrieved, extApis)
          : buildPrompt(ctx, retrieved, extApis, bricks),
      },
    ];
    const genOpts = {
      onProgress: opts.onProgress,
      maxTokens: repair ? 512 : 1400,
      // Gem 2: when the loop is stuck (ctx.effort climbs), sample hotter so the
      // extra candidates genuinely diverge instead of reprinting the same miss.
      temperature: Math.min(0.9, (ctx.attempt === 0 ? 0.5 : 0.4) + 0.12 * (ctx.effort ?? 0)),
    };

    let reply: string;
    if (!repair && opts.onToken) {
      // VISIBILITY: stream the draft token-by-token so the UI fills in live.
      reply = '';
      for await (const delta of chatStream(match, messages, genOpts)) {
        reply += delta;
        opts.onToken({ delta, full: reply, path: target, attempt: ctx.attempt });
      }
    } else {
      reply = await chat(match, messages, {
        ...genOpts,
        // Gem 1: constrain repairs to a JSON edit list so a weak model can't emit
        // prose-as-a-file. Engines without json mode ignore it; the parsers stay safe.
        responseFormat: repair ? { type: 'json_object' } : undefined,
      });
    }

    if (repair) {
      // Apply the patch against the real current files. If it located + applied,
      // use it. If the model ignored the format (no hunks applied), fall back to
      // parsing a whole-file reply — the patch is an optimization, never a wall.
      const patched = applyPatchReply(reply, ctx.files, target);
      if (patched.edits.length) return patched.edits;
    }
    return parseEdits(reply, ctx.files, target);
  };
}
