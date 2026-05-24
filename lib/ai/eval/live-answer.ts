/**
 * Xonvert AI — LIVE answer test (Node, real model).
 *
 * Replicates the new model-FIRST answer flow (model plans queries → gather →
 * model synthesizes from passages) against the genuine Qwen, on the exact
 * "disaster" queries. Proves the model understands the question and writes a
 * real answer instead of dumping raw snippets.
 *
 * Run:  npx tsx lib/ai/eval/live-answer.ts "who is dj aligator"
 */

import { planQueriesMessages, parseQueries, fallbackQueries, gatherForQueries } from '../research';
import { analyzeQuestion } from '../reason';

const DIM = (s: string) => `\x1b[2m${s}\x1b[0m`;
const B = (s: string) => `\x1b[1m${s}\x1b[0m`;

async function main() {
  const question = process.argv.slice(2).join(' ') || 'who is dj aligator';
  const convo = process.env.CONVO ? `Earlier in this chat the topic was "${process.env.CONVO}". Resolve any pronouns against that.\n` : '';

  const tf: any = await import('@xenova/transformers');
  tf.env.allowRemoteModels = true;
  console.log(DIM('loading model…'));
  const pipe: any = await tf.pipeline('text-generation', 'Xenova/Qwen1.5-0.5B-Chat', { quantized: true });
  const synth = async (msgs: any[], maxNew = 240): Promise<string> => {
    const res: any = await pipe(msgs, { max_new_tokens: maxNew, do_sample: true, temperature: 0.3, top_p: 0.9, repetition_penalty: 1.1, return_full_text: false });
    const out = res?.[0]?.generated_text;
    return (typeof out === 'string' ? out : String(out?.[out.length - 1]?.content ?? '')).trim();
  };

  console.log(B(`\nQuestion: ${question}`) + (convo ? DIM(`  [context: ${process.env.CONVO}]`) : ''));

  // 1) model plans queries
  let queries: string[] = [];
  try {
    const qp = planQueriesMessages(`${convo}Question: ${question}`);
    queries = parseQueries(await synth([{ role: 'system', content: qp.messages[0].content }, { role: 'user', content: qp.messages[1].content }], 80));
  } catch { /* fall back */ }
  if (!queries.length) queries = fallbackQueries(question, analyzeQuestion(question).topics);
  console.log(DIM(`planned queries: ${JSON.stringify(queries)}`));

  // 2) gather
  const evidence = await gatherForQueries(queries);
  console.log(DIM(`gathered ${evidence.length} passages from: ${evidence.map((e) => e.source.site).join(', ') || '(none)'}`));
  if (!evidence.length) { console.log('\n→ (no evidence — would say "not sure")\n'); return; }
  const passages = evidence.map((e) => `- ${e.text}`).join('\n').slice(0, 1900);

  // 3) model synthesizes
  const answer = await synth([
    { role: 'system', content: 'You are Xonvert, a sharp and friendly assistant. Using ONLY the notes below, answer the user\'s question directly in 2–4 natural sentences, in your own words. Ignore notes that are off-topic. If the notes do not contain the specific detail asked, give what IS known and briefly note that detail isn\'t available. Never mention "notes", "sources", or that you searched; invent nothing. /no_think' },
    { role: 'user', content: `${convo}Notes:\n${passages}\n\nQuestion: ${question}` },
  ]);

  console.log(B('\n──────── ANSWER ────────'));
  console.log(answer || '(empty)');
  console.log(B('─────────────────────────\n'));
}
main().catch((e) => { console.error(e?.message ?? e); process.exit(1); });
