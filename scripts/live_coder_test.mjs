/**
 * oioxo Code — LIVE test with a REAL small model (Node, no browser).
 *
 * The weak-device levers are unit-proven with fakes; this drives them with a
 * GENUINE small model to see them work end-to-end. It loads the same WASM-path
 * model the app falls back to (Xenova/Qwen1.5-0.5B-Chat via transformers.js — a
 * faithful proxy for the on-device coder) and runs the ACTUAL pipeline:
 *
 *   recallBricks (real corpus retrieval) → buildPrompt (real draft prompt, brick
 *   injected) → model → parseEdits → typeCheckFiles ORACLE → on fail
 *   buildPatchRepairPrompt → model → applyPatchReply (real diff apply) → re-check,
 *   all inside the real runCodeLoop.
 *
 * Run:        npm run oioxo:live
 * No bricks:  BRICKS=0 npm run oioxo:live      (A/B — see if the corpus helps)
 * Custom:     npm run oioxo:live -- "build a typed Stack class"
 *
 * First run downloads the model (~0.5GB, cached). CPU inference is slow.
 */
import { runCodeLoop } from '../lib/oioxo/codeloop.ts';
import { makeTypeCheckRun } from '../lib/oioxo/typecheck.ts';
import { buildPrompt, buildPatchRepairPrompt, parseEdits, singleTarget, SYSTEM, PATCH_SYSTEM } from '../lib/oioxo/codegen.ts';
import { applyPatchReply, estimateTokens } from '../lib/oioxo/patch.ts';
import { recallBricks } from '../lib/oioxo/brick-store.ts';

const DIM = (s) => `\x1b[2m${s}\x1b[0m`;
const BOLD = (s) => `\x1b[1m${s}\x1b[0m`;
const CYAN = (s) => `\x1b[36m${s}\x1b[0m`;

const useBricks = process.env.BRICKS !== '0';
const TASK = process.argv.slice(2).join(' ') ||
  'Fix the TypeScript error in util.ts. Keep the debounce behavior; change as little as possible.';
const TARGET = 'util.ts';

// Start from real typed code with a real bug (ms typed as string, passed to
// setTimeout which needs a number). An empty/lazy answer can't pass — the type
// oracle only goes green when the bug is actually fixed. This is the meaningful
// oracle for "fix it", and it drives the repair/patch path with the real model.
const BUGGY = [
  '// A debounce helper. It has ONE TypeScript error — fix it.',
  'export function debounce(fn: () => void, ms: string): () => void {',
  '  let t: ReturnType<typeof setTimeout> | undefined;',
  '  return () => {',
  '    if (t) clearTimeout(t);',
  '    t = setTimeout(fn, ms);',
  '  };',
  '}',
  '',
].join('\n');

console.log(BOLD('\noioxo Code — LIVE real-model test'));
console.log(`Task: ${TASK}`);
console.log(`Bricks: ${useBricks ? 'ON (corpus retrieval enabled)' : 'OFF'}\n`);

// Use a real small CODER (the kind that ships on-device), not the chat model.
// The v3 package (@huggingface/transformers) supports Qwen2.5-Coder + q4 ONNX.
const MODEL = process.env.MODEL || 'onnx-community/Qwen2.5-Coder-0.5B-Instruct';
const PKG = process.env.TF_PKG || '@huggingface/transformers';
const t0 = Date.now();
console.log(DIM(`Loading ${MODEL} via ${PKG} (first run downloads the weights)…`));
const tf = await import(PKG);
if (tf.env) tf.env.allowRemoteModels = true;
let pipe;
try {
  pipe = await tf.pipeline('text-generation', MODEL, { dtype: 'q4' });       // v3
} catch {
  pipe = await tf.pipeline('text-generation', MODEL, { quantized: true });   // v2 fallback
}
console.log(DIM(`Model ready in ${((Date.now() - t0) / 1000).toFixed(1)}s\n`));

const gen = async (messages, opts) => {
  const res = await pipe(messages, {
    max_new_tokens: Math.min(opts.maxTokens, 512),
    do_sample: opts.temperature > 0, temperature: Math.max(0.1, opts.temperature ?? 0.4), top_p: 0.9,
    repetition_penalty: 1.1, return_full_text: false,
  });
  const out = res?.[0]?.generated_text;
  if (typeof out === 'string') return out.trim();
  if (Array.isArray(out)) return String(out[out.length - 1]?.content ?? '').trim();
  return '';
};

let modelTokens = 0;

// The GenerateFn = exactly what makeCoderGenerate does, but the model call is
// transformers.js instead of web-llm (the pure prompt/parse/patch code is the real one).
const generate = async (ctx) => {
  const repair = ctx.attempt > 0 && !!ctx.error;
  const target = singleTarget(ctx.files);
  const bricks = !repair && useBricks ? await recallBricks(ctx.task).catch(() => '') : '';
  if (ctx.attempt === 0 && bricks) console.log(CYAN('▸ brick retrieved for the draft: ') + bricks.split('\n')[1]);

  const system = repair ? PATCH_SYSTEM : SYSTEM;
  const user = repair ? buildPatchRepairPrompt(ctx) : buildPrompt(ctx, undefined, undefined, bricks);
  const reply = await gen([{ role: 'system', content: system }, { role: 'user', content: user }],
    { maxTokens: repair ? 512 : 600, temperature: ctx.attempt === 0 ? 0.4 : 0.3 });
  modelTokens += estimateTokens(reply);
  console.log(DIM(`\n[attempt ${ctx.attempt} · ${repair ? 'PATCH' : 'DRAFT'} · model said ${estimateTokens(reply)} tok]`));
  console.log(DIM(reply.slice(0, 360) + (reply.length > 360 ? '…' : '')));

  if (repair) {
    const p = applyPatchReply(reply, ctx.files, target);
    console.log(DIM(`[patch: applied ${p.applied}, failed ${p.failed}]`));
    if (p.edits.length) return p.edits;
    console.log(DIM('[patch empty → falling back to whole-file parse]'));
  }
  return parseEdits(reply, ctx.files, target);
};

const res = await runCodeLoop({
  task: TASK,
  files: [{ path: TARGET, content: BUGGY }],
  testCmd: 'typecheck',
  maxIters: 3,
  generate,
  run: makeTypeCheckRun(), // the REAL TypeScript oracle (Node ts.sys libs)
  onStep: (s) => console.log(BOLD(`\n>>> attempt ${s.attempt}: ${s.ok ? 'GREEN ✓' : 'red'}`) + (s.errors ? DIM(' — ' + s.errors.split('\n')[0]) : '')),
});

console.log(BOLD('\n──────── FINAL ' + TARGET + ' ────────'));
console.log(res.files.find((f) => f.path === TARGET)?.content ?? '(none)');
console.log(BOLD('─────────────────────────────────'));
console.log(
  (res.ok ? BOLD('\n✅ REACHED GREEN') : BOLD('\n❌ did not reach green')) +
  ` in ${res.iters} iteration(s) · model emitted ≈${modelTokens} tokens total · ` +
  `${((Date.now() - t0) / 1000).toFixed(1)}s${res.engineError ? ` · engineError: ${res.engineError}` : ''}\n`,
);
