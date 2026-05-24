/**
 * Xonvert AI — LIVE adversarial decision test (Node, real model).
 *
 * Runs the model-FIRST decider (decide.ts) against UNSCRIPTED hard prompts on the
 * genuine model and prints what it decides. NOT a pass/fail eval — an honest look
 * at real behaviour, to judge and polish. Node uses the smaller 0.5B WITHOUT
 * grammar constraints, so this is a pessimistic lower bound vs Qwen3-0.6B+grammar.
 *
 * Run:  npx tsx lib/ai/eval/live-decide.ts
 */

import { candidatesFor, decisionPrompt, parseDecision, fallbackDecision, type DecideCtx } from '../decide';

const B = (s: string) => `\x1b[1m${s}\x1b[0m`;
const DIM = (s: string) => `\x1b[2m${s}\x1b[0m`;
const CY = (s: string) => `\x1b[36m${s}\x1b[0m`;

type Case = { q: string; file?: 'image' | 'audio' | 'video' | 'pdf' | 'text' };
const CASES: Case[] = [
  { q: 'convert song to stl' },
  { q: 'm4a to cad' },
  { q: 'turn this pdf into a podcast', file: 'pdf' },
  { q: 'extract the audio from this video', file: 'video' },
  { q: 'compress this', file: 'image' },
  { q: 'remove the background and convert to jpg', file: 'image' },
  { q: "what's the capital of mongolia" },
  { q: 'hey how are you' },
  { q: 'make my photo look vintage', file: 'image' },
  { q: 'transcribe this and translate to french', file: 'audio' },
];

async function main() {
  const tf: any = await import('@xenova/transformers');
  tf.env.allowRemoteModels = true;
  console.log(DIM('loading model…'));
  const pipe: any = await tf.pipeline('text-generation', 'Xenova/Qwen1.5-0.5B-Chat', { quantized: true });
  const gen = async (msgs: any[]): Promise<string> => {
    const res: any = await pipe(msgs, { max_new_tokens: 120, do_sample: false, repetition_penalty: 1.1, return_full_text: false });
    const o = res?.[0]?.generated_text;
    return (typeof o === 'string' ? o : String(o?.[o.length - 1]?.content ?? '')).trim();
  };

  console.log(B('\n═══ LIVE DECISIONS (real 0.5B, no grammar — lower bound) ═══\n'));
  for (const c of CASES) {
    const ctx: DecideCtx = { hasFile: !!c.file, fileFamily: c.file ?? null };
    const cands = candidatesFor(c.q, c.file ?? null);
    const { messages } = decisionPrompt(c.q, cands, ctx);
    let raw = '';
    let d;
    try { raw = await gen(messages); d = parseDecision(raw, cands); } catch { d = null; }
    const used = d ? '' : DIM(' (UNPARSED → fallback)');
    if (!d) d = fallbackDecision(c.q, cands, ctx);
    const detail = d.action === 'chain' || d.action === 'tool' ? d.tools.join(' → ')
      : d.action === 'answer' ? `"${d.query ?? c.q}"`
      : (d.reply ?? '');
    const fileTag = c.file ? DIM(`[${c.file}] `) : '';
    console.log(`${fileTag}${c.q}`);
    console.log(`   → ${CY(d.action)}${used}  ${DIM(detail)}`);
    console.log(DIM(`   model raw: ${raw.replace(/\s+/g, ' ').slice(0, 160) || '(empty)'}`));
    console.log(DIM(`   candidates: ${cands.map((x) => x.id).join(', ') || '(none)'}`) + '\n');
  }
}
main().catch((e) => { console.error(e?.message ?? e); process.exit(1); });
