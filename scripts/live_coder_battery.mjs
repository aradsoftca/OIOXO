/**
 * oioxo Code — HARD battery against the REAL coder model. Drives the genuine
 * pipeline (recallBricks → buildPrompt/buildPatchRepairPrompt → model → parse/patch
 * → typeCheckFiles oracle → runCodeLoop, bricks on, adaptive search on) over several
 * tougher scenarios and prints a scorecard. Run: npm run oioxo:battery
 *
 * Real model (Qwen2.5-Coder-1.5B via @huggingface/transformers); MODEL= to override.
 */
import { runCodeLoop } from '../lib/oioxo/codeloop.ts';
import { makeTypeCheckRun } from '../lib/oioxo/typecheck.ts';
import { buildPrompt, buildPatchRepairPrompt, parseEdits, singleTarget, SYSTEM, PATCH_SYSTEM } from '../lib/oioxo/codegen.ts';
import { applyPatchReply, estimateTokens } from '../lib/oioxo/patch.ts';
import { recallBricks } from '../lib/oioxo/brick-store.ts';

const MODEL = process.env.MODEL || 'onnx-community/Qwen2.5-Coder-1.5B-Instruct';
const DIM = (s) => `\x1b[2m${s}\x1b[0m`; const B = (s) => `\x1b[1m${s}\x1b[0m`;

const t0 = Date.now();
console.log(DIM(`Loading ${MODEL}…`));
const tf = await import('@huggingface/transformers');
if (tf.env) tf.env.allowRemoteModels = true;
let pipe;
try { pipe = await tf.pipeline('text-generation', MODEL, { dtype: 'q4' }); }
catch { pipe = await tf.pipeline('text-generation', MODEL, { quantized: true }); }
console.log(DIM(`ready in ${((Date.now() - t0) / 1000).toFixed(1)}s\n`));

const gen = async (messages, opts) => {
  const res = await pipe(messages, {
    max_new_tokens: Math.min(opts.maxTokens, 512), do_sample: (opts.temperature ?? 0.4) > 0,
    temperature: Math.max(0.1, opts.temperature ?? 0.4), top_p: 0.9, repetition_penalty: 1.1, return_full_text: false,
  });
  const out = res?.[0]?.generated_text;
  return typeof out === 'string' ? out.trim() : Array.isArray(out) ? String(out[out.length - 1]?.content ?? '').trim() : '';
};

function makeGenerate(meter) {
  return async (ctx) => {
    const repair = ctx.attempt > 0 && !!ctx.error;
    const target = singleTarget(ctx.files);
    const bricks = !repair ? await recallBricks(ctx.task).catch(() => '') : '';
    const sys = repair ? PATCH_SYSTEM : SYSTEM;
    const user = repair ? buildPatchRepairPrompt(ctx) : buildPrompt(ctx, undefined, undefined, bricks);
    const reply = await gen([{ role: 'system', content: sys }, { role: 'user', content: user }],
      { maxTokens: repair ? 512 : 700, temperature: ctx.attempt === 0 ? 0.4 : Math.min(0.8, 0.3 + 0.12 * (ctx.effort ?? 0)) });
    meter.calls++; meter.tokens += estimateTokens(reply); meter.repair ||= repair;
    if (repair) { const p = applyPatchReply(reply, ctx.files, target); meter.patched ||= p.applied > 0; if (p.edits.length) return p.edits; }
    return parseEdits(reply, ctx.files, target);
  };
}

const SCENARIOS = [
  {
    name: 'fix 1 type error', target: 'u.ts',
    files: [{ path: 'u.ts', content: 'export function debounce(fn: () => void, ms: string): () => void {\n  let t: ReturnType<typeof setTimeout> | undefined;\n  return () => { if (t) clearTimeout(t); t = setTimeout(fn, ms); };\n}\n' }],
    task: 'Fix the TypeScript error in u.ts. Change as little as possible.',
  },
  {
    name: 'fix 3 type errors (multi-repair + adaptive)', target: 'm.ts',
    files: [{ path: 'm.ts', content: 'export const a: number = "1";\nexport const b: string = 2;\nexport function area(w: number, h: number): number { return w * h; }\nexport const sq = area(3);\n' }],
    task: 'Fix all the TypeScript errors in m.ts.',
  },
  {
    name: 'implement a missing function (meaningful oracle)', target: 'c.ts',
    files: [{ path: 'c.ts', content: '// implement compute() so this type-checks; it must return a number.\nexport const result: number = compute() * 2;\n' }],
    task: 'Implement the missing compute() function in c.ts so it type-checks. It must return a number.',
  },
  {
    name: 'reuse a verified brick (debounce from scratch)', target: 'd.ts',
    files: [{ path: 'd.ts', content: '// TODO: implement and export debounce(fn, ms)\n' }],
    task: 'Create and export a debounce(fn, ms) helper that delays calling fn until ms after the last call.',
  },
];

const scores = [];
for (const sc of SCENARIOS) {
  const meter = { calls: 0, tokens: 0, repair: false, patched: false };
  const st = Date.now();
  let res;
  try {
    res = await runCodeLoop({
      task: sc.task, files: sc.files, testCmd: 'typecheck', maxIters: 4, candidates: 1, maxCandidates: 3,
      generate: makeGenerate(meter), run: makeTypeCheckRun(),
    });
  } catch (e) { res = { ok: false, iters: 0, engineError: String(e?.message || e) }; }
  scores.push({ name: sc.name, ok: res.ok, iters: res.iters, calls: meter.calls, tokens: meter.tokens, repair: meter.repair, patched: meter.patched, secs: ((Date.now() - st) / 1000).toFixed(1), err: res.engineError });
  console.log(`${res.ok ? B('✅') : '❌'} ${sc.name} — ${res.ok ? 'GREEN' : 'red'} in ${res.iters} iter, ${meter.calls} calls, ≈${meter.tokens} tok, ${((Date.now() - st) / 1000).toFixed(1)}s${meter.repair ? (meter.patched ? ', patch✓' : ', patch✗→fallback') : ''}${res.engineError ? ' [' + res.engineError.slice(0, 40) + ']' : ''}`);
}

const green = scores.filter((s) => s.ok).length;
console.log(B(`\nSCORECARD: ${green}/${scores.length} reached GREEN (real model + real oracle) · total ${((Date.now() - t0) / 1000).toFixed(1)}s`));
