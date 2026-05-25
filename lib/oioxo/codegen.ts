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

const SYSTEM =
  'You are an expert coding agent working in a sandbox. Make the SMALLEST change ' +
  'that satisfies the task or fixes the error. Output ONLY the files you create or ' +
  'change — each as a fenced code block whose info line is the file PATH, e.g.\n' +
  '```src/add.js\n<full file contents>\n```\nNo prose, no explanation, no extra text.';

function renderFiles(files: { path: string; content: string }[], cap = 8000): string {
  let out = '';
  for (const f of files) {
    const body = f.content.length > cap ? f.content.slice(0, cap) + '\n…(truncated)…' : f.content;
    out += `--- ${f.path} ---\n${body}\n\n`;
  }
  return out.trim() || '(empty project)';
}

/** Build the user message for a draft (attempt 0) or a repair (attempt ≥1).
 *  With a retrieved context it shows only the RELEVANT files + the project's
 *  exact API signatures (so the model uses real APIs instead of inventing).
 *  `extApis` carries grabbed external-library signatures (P4 search-grab-fix). */
export function buildPrompt(ctx: GenContext, retrieved?: RetrievedContext, extApis?: string): string {
  const shown = retrieved?.relevantFiles ?? ctx.files;
  const files = shown.length ? `Relevant files:\n${renderFiles(shown)}\n\n` : '';
  const apis = retrieved?.symbolIndex
    ? `Project APIs (exact signatures — call these, do NOT invent names):\n${retrieved.symbolIndex.slice(0, 4000)}\n\n`
    : '';
  const ext = extApis ? `External libraries (fetched — use these REAL APIs, do NOT guess):\n${extApis.slice(0, 4000)}\n\n` : '';
  if (ctx.attempt === 0 || !ctx.error) {
    return `Task: ${ctx.task}\n\n${ext}${apis}${files}Write the file(s) to do this.`;
  }
  return `Task: ${ctx.task}\n\n${ext}${apis}${files}It FAILED with:\n${ctx.error}\n\nMake the minimal fix. Output only the changed file(s).`;
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

/**
 * Parse a model reply into file edits. Accepts (in order): a fenced block whose
 * info line is a PATH (```src/add.js); a `// path:` / `# x.py` header inside the
 * block; and — crucially for weak models — a LANGUAGE-only fence (```js, ```html)
 * mapped to the project file it targets. As a last resort, an unfenced reply that
 * looks like a whole file is mapped to the single relevant project file. Pure.
 */
export function parseEdits(reply: string, project: { path: string }[] = []): Edit[] {
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
      { onProgress: opts.onProgress, maxTokens: 1400, temperature: ctx.attempt === 0 ? 0.3 : 0.2 },
    );
    return parseEdits(reply, ctx.files);
  };
}
