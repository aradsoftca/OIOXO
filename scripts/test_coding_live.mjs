/**
 * REAL end-to-end coding-loop test, headless. Loads the actual on-device coder
 * (Qwen2.5-Coder-0.5B via transformers.js, in Node) and drives the REAL loop
 * (lib/oioxo/codeloop runCodeLoop — pure + injectable) with:
 *   generate = the real model + our buildPrompt + parseEdits,
 *   run      = a real `node --test` oracle in a temp dir.
 * So it tests the device-as-oracle thesis with a real tiny model — does it write
 * real files and go red→green? Slow on CPU (model download + generation).
 *
 * Run: npx tsx scripts/test_coding_live.mjs
 */
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { runCodeLoop, extractErrors } from '../lib/oioxo/codeloop.ts';
import { buildPrompt, parseEdits, singleTarget, SYSTEM } from '../lib/oioxo/codegen.ts';

const MODEL = process.env.CODER_MODEL || 'onnx-community/Qwen2.5-Coder-0.5B-Instruct';

// A clear red→green repair task: the test expects add to SUM, the code subtracts.
const TASK = 'Make the failing test pass.';
const FILES = [
  { path: 'index.js', content: 'export function add(a, b) {\n  return a - b; // BUG\n}\n' },
  { path: 'index.test.js', content: "import { test } from 'node:test';\nimport assert from 'node:assert';\nimport { add } from './index.js';\ntest('adds', () => { assert.equal(add(2, 3), 5); });\n" },
];

console.log(`loading model ${MODEL} (first run downloads ~0.4GB)…`);
const t0 = Date.now();
const { pipeline } = await import('@huggingface/transformers');
const pipe = await pipeline('text-generation', MODEL, { dtype: 'q4' });
console.log(`model ready in ${((Date.now() - t0) / 1000).toFixed(0)}s`);

const generate = async (ctx) => {
  const user = buildPrompt(ctx);
  // Sample on every attempt so best-of-N candidates differ (matches the product).
  const out = await pipe(
    [{ role: 'system', content: SYSTEM }, { role: 'user', content: user }],
    { max_new_tokens: 512, do_sample: true, temperature: ctx.attempt === 0 ? 0.4 : 0.35, top_p: 0.92, return_full_text: false },
  );
  const reply = Array.isArray(out) ? (out[0]?.generated_text ?? '') : '';
  const text = typeof reply === 'string' ? reply : (reply.at?.(-1)?.content ?? '');
  console.log(`\n--- attempt ${ctx.attempt} model reply (${text.length} chars) ---\n${text.slice(0, 600)}\n---`);
  const edits = parseEdits(text, ctx.files, singleTarget(ctx.files));
  console.log(`parsed ${edits.length} edit(s): ${edits.map((e) => e.path).join(', ') || '(none)'}`);
  return edits;
};

const run = async (files) => {
  const dir = mkdtempSync(join(tmpdir(), 'oioxo-loop-'));
  try {
    for (const f of files) writeFileSync(join(dir, f.path), f.content);
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 't', type: 'module' }));
    try {
      const out = execFileSync('node', ['--test'], { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
      return { ok: true, output: out, errors: '' };
    } catch (e) {
      const output = `${e.stdout || ''}\n${e.stderr || ''}`;
      return { ok: false, output, errors: extractErrors(output) };
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

const res = await runCodeLoop({
  task: TASK, files: FILES, testCmd: 'node --test', maxIters: 5, candidates: 2,
  generate, run,
  onStep: (s) => console.log(`step ${s.attempt}: ${s.ok ? 'PASS' : 'fail'}`),
});

console.log('\n================ RESULT ================');
console.log(`ok=${res.ok}  iters=${res.iters}`);
const fixed = res.files.find((f) => f.path === 'index.js');
console.log('final index.js:\n' + (fixed?.content ?? '(missing)'));
console.log(res.ok ? '\n✅ red→green with the REAL on-device coder — the loop works.' : '\n❌ did not reach green in 5 tries.');
process.exit(res.ok ? 0 : 1);
