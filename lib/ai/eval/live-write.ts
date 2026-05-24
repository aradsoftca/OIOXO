/**
 * Xonvert AI — LIVE composition test (Node, real model).
 *
 * Loads the GENUINE fallback model the app ships (Xenova/Qwen1.5-0.5B-Chat via
 * transformers.js — the same one the WASM path uses) and drives the REAL
 * compose.ts pipeline end-to-end: goal → job → outline → [gather] → sections →
 * assemble. This is an actual test of the brain producing a real article, not a
 * mock. (The WebGPU path runs Qwen3-0.6B; this 0.5B is its smaller sibling and a
 * faithful proxy for output quality.)
 *
 * Run:   npx tsx lib/ai/eval/live-write.ts "write a short article about why cats purr"
 * Gather: GATHER=1 npx tsx lib/ai/eval/live-write.ts "..."   (also pulls live web facts)
 *
 * First run downloads the model (~0.5 GB, cached after). CPU inference is slow —
 * keep the prompt to a SHORT/medium piece for a quick signal.
 */

import { inferGoal } from '../goal';
import { planJob, type JobStep } from '../job';
import { outlinePrompt, parseOutline, sectionPrompt, assemble, gatherQueries, type ComposeSpec } from '../compose';

const DIM = (s: string) => `\x1b[2m${s}\x1b[0m`;
const BOLD = (s: string) => `\x1b[1m${s}\x1b[0m`;
const CYAN = (s: string) => `\x1b[36m${s}\x1b[0m`;

async function main() {
  const prompt = process.argv.slice(2).join(' ') || 'write a short article about why cats purr';
  const useGather = process.env.GATHER === '1';

  console.log(BOLD('\nRequest: ') + prompt + (useGather ? DIM('  [+web gather]') : ''));

  const goal = inferGoal(prompt, {});
  const job = planJob(goal, prompt);
  if (!job) { console.log('Not a composition job — would route elsewhere.'); return; }
  const ws = job.steps.find((s): s is Extract<JobStep, { type: 'write' }> => s.type === 'write')!;
  const spec: ComposeSpec = { form: ws.form, topic: ws.topic, length: ws.length, lang: ws.lang };
  console.log(DIM(`Plan: ${job.steps.map((s) => s.type).join(' → ')}  ·  form=${spec.form} length=${spec.length} topic="${spec.topic}"\n`));

  // --- load the real model -------------------------------------------------
  console.log(DIM('Loading Xenova/Qwen1.5-0.5B-Chat (first run downloads ~0.5GB)…'));
  const t0 = Date.now();
  const tf: any = await import('@xenova/transformers');
  tf.env.allowRemoteModels = true;
  const pipe: any = await tf.pipeline('text-generation', 'Xenova/Qwen1.5-0.5B-Chat', { quantized: true });
  console.log(DIM(`Model ready in ${((Date.now() - t0) / 1000).toFixed(1)}s\n`));

  const gen = async (messages: { role: string; content: string }[], opts: { maxTokens: number; temperature?: number }): Promise<string> => {
    const temp = opts.temperature ?? 0.4;
    const res: any = await pipe(messages, {
      max_new_tokens: Math.min(opts.maxTokens, 512),
      do_sample: temp > 0, temperature: Math.max(0.1, temp), top_p: 0.9,
      repetition_penalty: 1.1, return_full_text: false,
    });
    const out = res?.[0]?.generated_text;
    if (typeof out === 'string') return out.trim();
    if (Array.isArray(out)) return String(out[out.length - 1]?.content ?? '').trim();
    return '';
  };

  // 1) outline
  const op = outlinePrompt(spec);
  const headings = parseOutline(await gen(op.messages, { maxTokens: 220, temperature: 0.3 }), spec);
  console.log(CYAN('Outline: ') + headings.join('  |  ') + '\n');

  // 2) optional gather
  let facts = '';
  if (useGather && job.steps.some((s) => s.type === 'gather')) {
    console.log(DIM('Gathering from the web…'));
    try {
      const { gatherForQueries } = await import('../research');
      const ev = await gatherForQueries(gatherQueries(spec, headings));
      facts = ev.map((e: any) => `(${e.source.site}) ${e.text}`).join('\n').slice(0, 1400);
      console.log(DIM(`Got ${facts ? ev.length : 0} sources\n`));
    } catch (e) { console.log(DIM('Gather failed — writing from knowledge\n')); }
  }

  // 3) write each section
  const bodies: string[] = [];
  for (let i = 0; i < headings.length; i++) {
    process.stdout.write(DIM(`Writing ${i + 1}/${headings.length}: ${headings[i]}… `));
    const ts = Date.now();
    const sp = sectionPrompt(spec, headings[i], headings, bodies.join('\n\n'));
    const msgs = facts ? [sp.messages[0], { role: 'user' as const, content: `${sp.messages[1].content}\n\nGround it in these facts:\n${facts}` }] : sp.messages;
    bodies.push(await gen(msgs, { maxTokens: sp.maxTokens, temperature: 0.45 }));
    console.log(DIM(`${((Date.now() - ts) / 1000).toFixed(1)}s`));
  }

  // 4) assemble
  const article = assemble(spec, headings, bodies);
  console.log(BOLD('\n──────── ARTICLE ────────\n'));
  console.log(article);
  console.log(BOLD('\n─────────────────────────'));
  console.log(DIM(`\n${article.split(/\s+/).length} words · total ${((Date.now() - t0) / 1000).toFixed(1)}s\n`));
}

main().catch((e) => { console.error(e); process.exit(1); });
