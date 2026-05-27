/**
 * gen-querygen-data — distill a TINY on-device "query writer" from a strong teacher.
 *
 * The gap we proved empirically: the base 360M, asked for search keywords, ignores
 * the instruction and gives (bad) advice instead. Query-generation is a narrow,
 * learnable skill — so we fine-tune the 360M for it. This builds the training set:
 * Gemini generates many DIVERSE, realistic, messy user messages and, for each, the
 * IDEAL primary web-search query a skilled researcher would type + ONE refined
 * fallback query to try if the first returns weak results (the agentic re-search
 * the user described).
 *
 * SERVE CONTRACT (keep identical in training + at inference): given the user message,
 * emit ONLY  {"query": "...", "refine": "..."}.
 *
 * Run (key injected, never printed):
 *   GEMINI_API_KEY=$(node -e "console.log(require('D:/appz/science/llm_settings.json').api_key)") \
 *   N=200 npx tsx lib/ai/eval/gen-querygen-data.ts
 * Out (gitignored moat): lib/ai/eval/out/querygen-data.jsonl  ({input:{message},label:{query,refine}})
 */
import * as fs from 'fs';
import * as path from 'path';

const KEY = process.env.GEMINI_API_KEY;
const MODEL = process.env.GEN_MODEL || 'gemini-2.5-pro';

/** The serve contract — the system prompt the fine-tuned model is trained against. */
export const QUERYGEN_SYSTEM =
  'You turn the user\'s message into the best WEB SEARCH QUERY — the concise keywords a skilled ' +
  'researcher types into a search engine. Drop filler, emotion, greetings, and first-person ("I\'m 40, ' +
  'scared"); keep the real entities (brands, models, places, error text) and the intent word ' +
  '("how to", "fix", "review", "best", a year). Also give ONE different, more specific fallback query ' +
  'to try if the first returns weak results. Output ONLY JSON: {"query":"...","refine":"..."}.';

// Domains to force breadth — the teacher is told to spread across these.
const KINDS = [
  'how-to / instructional (with personal context, fears, beginner)',
  'troubleshooting (name a real product/model/error code)',
  'factual lookup (who/what/when/where)',
  'current-events verification ("is it true X happens next week")',
  'product recommendation WITH a constraint ("not jewelry", "under $50", "for kids")',
  'opinion / best-of / comparison (X vs Y)',
  'reasoning / estimation ("estimate revenue of a carwash in Mongolia")',
  'coding / dev ("lightweight cpu tts", a stack trace, a library)',
  'definition / concept explanation',
  'cooking / home / health remedy (typos, casual)',
  'multi-part or vague question that needs narrowing',
];

async function gemini(prompt: string): Promise<string> {
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${KEY}`,
    {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 1.0,
          maxOutputTokens: MODEL.includes('flash') ? 4000 : 8000,
          responseMimeType: 'application/json',
          ...(MODEL.includes('flash') ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
        },
      }),
    },
  );
  if (!r.ok) return '';
  return ((await r.json())?.candidates?.[0]?.content?.parts?.map((x: any) => x.text).join('') ?? '').trim(); // eslint-disable-line @typescript-eslint/no-explicit-any
}

interface Row { message: string; query: string; refine: string; kind?: string }

function valid(r: any): r is Row { // eslint-disable-line @typescript-eslint/no-explicit-any
  return r && typeof r.message === 'string' && r.message.trim().length > 3
    && typeof r.query === 'string' && r.query.trim().length > 1
    && typeof r.refine === 'string' && r.refine.trim().length > 1
    // reject the failure mode we saw: the "query" must NOT be an answer/advice list
    && !/^\s*\d+\.\s/.test(r.query) && r.query.split(/\s+/).length <= 9;
}

function prompt(n: number, kinds: string[]): string {
  return `You build training data for a tiny on-device model whose ONLY job is to convert a user's ` +
    `(often messy, conversational, emotional, typo-ridden, multi-part) message into the best WEB SEARCH ` +
    `QUERY, plus a refined fallback.\n\n` +
    `Generate ${n} DIVERSE, realistic user messages. Spread them across these kinds (roughly even):\n` +
    kinds.map((k, i) => `${i + 1}. ${k}`).join('\n') + `\n\n` +
    `For EACH message output:\n` +
    `- "query": the ideal primary search query — concise keywords (max ~8 words). Drop filler, emotion, ` +
    `greetings, first-person. KEEP real entities (brands/models/places/error text) and the intent word ` +
    `(how to / fix / review / best / a year). Never a numbered list or an answer — just search keywords.\n` +
    `- "refine": a DIFFERENT, more specific fallback query to try if the first is weak (add a year, a ` +
    `synonym, a site-type like "forum" or "reddit", or narrow the entity).\n` +
    `- "kind": which kind above it is.\n\n` +
    `Make the messages genuinely varied and realistic (real brand/model names, real places, real errors, ` +
    `typos, personal context). Return ONLY a JSON array of {"message","query","refine","kind"}.`;
}

async function main() {
  if (!KEY) { console.error('set GEMINI_API_KEY'); process.exit(2); }
  const N = process.env.N ? Number(process.env.N) : 30;
  const per = Math.min(20, N); // ask in batches so the teacher stays sharp + JSON small
  const outDir = path.join(process.cwd(), 'lib/ai/eval/out');
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, process.env.OUT || 'querygen-data.jsonl');
  const ws = fs.createWriteStream(outFile, { flags: 'a' });
  const seen = new Set<string>();
  let kept = 0;

  for (let got = 0; got < N; got += per) {
    // rotate which kinds lead each batch for variety
    const rotated = [...KINDS.slice(got % KINDS.length), ...KINDS.slice(0, got % KINDS.length)];
    const raw = await gemini(prompt(Math.min(per, N - got), rotated)).catch(() => '');
    let arr: any[] = []; // eslint-disable-line @typescript-eslint/no-explicit-any
    try { arr = JSON.parse(raw); } catch { arr = []; }
    if (!Array.isArray(arr)) arr = [];
    for (const r of arr) {
      if (!valid(r)) continue;
      const key = r.message.toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 60);
      if (seen.has(key)) continue;
      seen.add(key);
      ws.write(JSON.stringify({ input: { message: r.message.trim() }, label: { query: r.query.trim(), refine: r.refine.trim() } }) + '\n');
      kept++;
    }
    console.log(`batch ${got / per + 1}: kept ${kept}/${got + per} requested`);
  }
  ws.end();
  console.log(`\nwrote ${kept} query-gen examples → ${outFile}`);
}

main();
