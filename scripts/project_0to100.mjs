/**
 * STRICT 0→100 test: drive the REAL agent (plan → step-by-step build → real coder
 * → real type oracle) over a multi-step project, track every step, and analyze
 * hard. Each step must KEEP prior code AND add the new piece (the coherence test a
 * one-shot can't fake). Run: npm run oioxo:0to100   (MODEL= to override)
 */
import { runAgent } from '../lib/oioxo/agent.ts';
import { runCodeLoop } from '../lib/oioxo/codeloop.ts';
import { makeTypeCheckRun, typeCheckFiles, formatDiags } from '../lib/oioxo/typecheck.ts';
import { buildPrompt, buildPatchRepairPrompt, parseEdits, singleTarget, SYSTEM, PATCH_SYSTEM } from '../lib/oioxo/codegen.ts';
import { applyPatchReply, estimateTokens } from '../lib/oioxo/patch.ts';
import { recallBricks } from '../lib/oioxo/brick-store.ts';

const MODEL = process.env.MODEL || 'onnx-community/Qwen2.5-Coder-1.5B-Instruct';
const B = (s) => `\x1b[1m${s}\x1b[0m`; const DIM = (s) => `\x1b[2m${s}\x1b[0m`;
const t0 = Date.now();

console.log(DIM(`Loading ${MODEL}…`));
const tf = await import('@huggingface/transformers');
if (tf.env) tf.env.allowRemoteModels = true;
let pipe; try { pipe = await tf.pipeline('text-generation', MODEL, { dtype: 'q4' }); } catch { pipe = await tf.pipeline('text-generation', MODEL, { quantized: true }); }
console.log(DIM(`ready in ${((Date.now() - t0) / 1000).toFixed(1)}s\n`));

const gen = async (messages, opts) => {
  const r = await pipe(messages, { max_new_tokens: Math.min(opts.maxTokens, 512), do_sample: (opts.temperature ?? 0.4) > 0, temperature: Math.max(0.1, opts.temperature ?? 0.4), top_p: 0.9, repetition_penalty: 1.1, return_full_text: false });
  const o = r?.[0]?.generated_text; return typeof o === 'string' ? o.trim() : Array.isArray(o) ? String(o[o.length - 1]?.content ?? '').trim() : '';
};

const meter = { calls: 0, tokens: 0 };
const makeGen = () => async (ctx) => {
  const repair = ctx.attempt > 0 && !!ctx.error;
  const target = singleTarget(ctx.files);
  const bricks = !repair ? await recallBricks(ctx.task).catch(() => '') : '';
  const sys = repair ? PATCH_SYSTEM : SYSTEM;
  const user = repair ? buildPatchRepairPrompt(ctx) : buildPrompt(ctx, undefined, undefined, bricks);
  const reply = await gen([{ role: 'system', content: sys }, { role: 'user', content: user }], { maxTokens: repair ? 512 : 700, temperature: ctx.attempt === 0 ? 0.4 : Math.min(0.8, 0.3 + 0.12 * (ctx.effort ?? 0)) });
  meter.calls++; meter.tokens += estimateTokens(reply);
  if (repair) { const p = applyPatchReply(reply, ctx.files, target); if (p.edits.length) return p.edits; }
  return parseEdits(reply, ctx.files, target);
};

// A real multi-step module build. Each step keeps the prior class + adds a piece —
// the type oracle stays the strict gate the whole way.
const GOAL = 'Build a generic in-memory KVStore<T> class in store.ts (typed).';
const PLAN = [
  { title: 'get/set', task: 'In store.ts, create and export a generic class KVStore<T> backed by a private Map<string, T>, with methods get(key: string): T | undefined and set(key: string, value: T): void.' },
  { title: 'delete + keys', task: 'Edit store.ts: add to the KVStore<T> class delete(key: string): boolean and keys(): string[]. Keep the existing get and set methods and the class.' },
  { title: 'size + clear', task: 'Edit store.ts: add to the KVStore<T> class a getter get size(): number and a method clear(): void. Keep ALL existing methods.' },
  { title: 'typed usage', task: 'Edit store.ts: at the end, add `export const demo = (() => { const s = new KVStore<number>(); s.set("a", 1); const v = s.get("a"); s.delete("a"); return s.size; })();` Keep the whole class above it.' },
];

const steps = [];
const build = async (task, files, ctx) => {
  const framed = `${task}\n\n(Step ${ctx.index + 1} of ${ctx.total} toward: "${ctx.goal}". Keep the project consistent and type-correct; only change what this step needs.)`;
  const before = meter.calls;
  const res = await runCodeLoop({ task: framed, files, testCmd: 'typecheck', maxIters: 6, candidates: 1, maxCandidates: 3, generate: makeGen(), run: makeTypeCheckRun() });
  steps.push({ i: ctx.index, title: PLAN[ctx.index]?.title || task.slice(0, 24), ok: res.ok, iters: res.iters, calls: meter.calls - before, lastErr: res.ok ? '' : (res.lastOutput || '').split('\n')[0].slice(0, 90) });
  return { files: res.files, ok: res.ok, iters: res.iters, engineError: res.engineError };
};

console.log(B(`0→100: ${GOAL}\nPlan: ${PLAN.length} steps\n`));
let files = [{ path: 'store.ts', content: '// build here\n' }];
const agen = runAgent({ goal: GOAL, files, plan: async () => PLAN, build, maxSteps: PLAN.length });
while (true) {
  const n = await agen.next();
  if (n.done) { files = n.value.files; break; }
  const ev = n.value;
  if (ev.type === 'step-start') process.stdout.write(`→ step ${ev.index + 1} ${PLAN[ev.index]?.title}… `);
  if (ev.type === 'step-done') console.log(ev.ok ? B(`✓ ${ev.iters} iter`) : `✗ ${ev.iters} iter`);
  if (ev.type === 'files') files = ev.files;
}

// ── STRICT ANALYSIS ──────────────────────────────────────────────────────────
const finalFile = files.find((f) => f.path === 'store.ts')?.content ?? '';
const finalDiags = await typeCheckFiles([{ path: 'store.ts', content: finalFile }]);
const has = (re) => re.test(finalFile);
const wanted = [['class KVStore', /class\s+KVStore/], ['get', /\bget\s*\(/], ['set', /\bset\s*\(/], ['delete', /\bdelete\s*\(/], ['keys', /\bkeys\s*\(/], ['size', /get\s+size\b|\bsize\b\s*[:(]/], ['clear', /\bclear\s*\(/], ['demo usage', /export\s+const\s+demo/]];
const present = wanted.filter(([, re]) => has(re));

console.log(B('\n──────── STRICT ANALYSIS ────────'));
console.log('Steps:');
for (const s of steps) console.log(`  ${s.ok ? '✓' : '✗'} ${s.i + 1}. ${s.title} — ${s.iters} iter, ${s.calls} model calls${s.lastErr ? ' — ' + s.lastErr : ''}`);
const stepsOk = steps.filter((s) => s.ok).length;
console.log(`\nStep pass rate:      ${stepsOk}/${steps.length}`);
console.log(`Required features:   ${present.length}/${wanted.length} present (${present.map((p) => p[0]).join(', ')})`);
console.log(`Final type-check:    ${finalDiags.length === 0 ? 'CLEAN ✅' : 'ERRORS ❌ — ' + formatDiags(finalDiags).split('\n')[0]}`);
console.log(`Model cost:          ${meter.calls} calls, ≈${meter.tokens} tokens, ${((Date.now() - t0) / 1000).toFixed(1)}s total`);
const completeness = Math.round((present.length / wanted.length) * 100);
const verdict = finalDiags.length === 0 && completeness === 100 ? '100/100 — complete + type-correct'
  : finalDiags.length === 0 ? `${completeness}/100 — compiles but incomplete (missing features)`
  : `${completeness}/100 — INCOMPLETE and/or does not type-check`;
console.log(B(`\nVERDICT: ${verdict}`));
console.log(B('\n──────── FINAL store.ts ────────'));
console.log(finalFile.slice(0, 1400));
