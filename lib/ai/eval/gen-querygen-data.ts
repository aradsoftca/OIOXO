/**
 * gen-querygen-data — distill a TINY on-device "query writer" from a one-time
 * teacher. Its job: turn ONE messy user message into a SET of DIVERSE web-search
 * queries that attack the question from different angles. The search loop then runs
 * ALL of them, pools the results, reranks, and synthesizes — fan-out beats a single
 * query because different angles surface different sources ("mix and decide").
 *
 * The failure we fix: the base 360M echoes long messages instead of compressing,
 * and a single query misses. So the labels are (a) hard-compressed (≤7 words,
 * filler/emotion/first-person stripped, entities + intent word kept) and (b) a
 * genuinely DIVERSE set (different keywords/synonyms, the specific entity/error, the
 * constraint, the broader category) — not paraphrases.
 *
 * SERVE CONTRACT (identical in trainer + at inference): emit ONLY {"queries":[...]}.
 *
 * Teacher = Gemini, ONE-TIME, offline (flash, thinking off → pennies; never called
 * at runtime). Run (key injected, never printed):
 *   GEMINI_API_KEY=$(node -e "console.log(require('D:/appz/science/llm_settings.json').api_key)") \
 *   GEN_MODEL=gemini-2.5-flash N=3000 npx tsx lib/ai/eval/gen-querygen-data.ts
 * Out (gitignored moat): lib/ai/eval/out/querygen-data.jsonl  ({input:{message},label:{queries}})
 */
import * as fs from 'fs';
import * as path from 'path';

const KEY = process.env.GEMINI_API_KEY;
const MODEL = process.env.GEN_MODEL || 'gemini-2.5-flash';

/** Serve contract — the system prompt the fine-tuned model is trained against. */
export const QUERYGEN_SYSTEM =
  'You turn the user\'s message into a SET of 3 DIVERSE web-search queries that attack it from ' +
  'different angles (different keywords/synonyms, the specific entity or error, the key constraint, ' +
  'the broader category). Each query is concise KEYWORDS (max 7 words): drop filler, emotion, ' +
  'greetings and first-person; KEEP real entities (brands, models, places, error text) and the intent ' +
  'word ("how to", "fix", "review", "best", a year). Not paraphrases — genuinely different angles. ' +
  'Output ONLY JSON: {"queries":["...","...","..."]}.';

// Breadth: ~40 domains so the model sees the whole space of what people ask about.
const DOMAINS = [
  'car / auto repair', 'home repair / appliances', 'gardening / plants', 'cooking / recipes',
  'health symptoms / remedies', 'fitness / nutrition', 'mental health / life advice', 'parenting / kids',
  'pets / animals', 'computer / phone tech support', 'programming / debugging', 'web / app development',
  'data / machine learning', 'personal finance / investing', 'taxes', 'starting a business / revenue estimates',
  'careers / jobs / resumes', 'travel / places', 'shopping / product picks', 'buying electronics',
  'beauty / skincare', 'fashion / clothing', 'relationships', 'learning a skill / how-to',
  'science / how things work', 'history', 'geography / countries', 'current events / news / verification',
  'sports', 'video games', 'movies / TV', 'music / instruments', 'law / legal questions', 'real estate / housing',
  'language / translation / grammar', 'math / calculations', 'DIY / crafts', 'photography / cameras',
  'productivity / software tips', 'gifts / occasions (with constraints)',
];

// Breadth: how people actually phrase things. Each batch is told to MIX these.
const STYLES = [
  'a terse one-liner, lowercase, no punctuation',
  'a long rambling paragraph with backstory and emotion',
  'panicked / urgent with typos and run-ons',
  'polite and formal, full sentences',
  'a multi-part question (two asks in one message)',
  'vague and under-specified (barely enough to search)',
  'ESL / translated phrasing, slightly off grammar',
  'casual slang with filler (like, kinda, ugh, tbh)',
  'hyper-specific with model numbers, error codes or versions',
  'carries a hard constraint (a budget, "not X", "for my <person>", a place, a year)',
];

// Few-shot anchors: show the HARD compression + diverse angles the teacher must copy.
const ANCHORS = `EXAMPLES (note the heavy compression and the DIFFERENT angles, never paraphrases):
- "Ugh ok so my grandma gave me her old climbing roses and I'm terrified I'll kill them, it's spring here in Ohio, how do I prune them right?"
  {"queries":["how to prune climbing roses","climbing rose pruning spring","when to prune roses ohio"]}
- "my GE fridge model GSS25GSHBCSS started this weird buzzing from the back yesterday, ice maker still works tho"
  {"queries":["GE GSS25GSHBCSS buzzing noise","GE refrigerator fan motor buzzing","fridge buzzing back not cooling fix"]}
- "thinking about opening a little coffee shop in a mid size US city, roughly how much could it make a year?"
  {"queries":["average coffee shop annual revenue","small coffee shop profit margin","coffee shop sales per day us"]}
- "need a present for my wife shes turning 60 but she hates jewelry and i dont wanna spend a fortune"
  {"queries":["non-jewelry gifts for women 60","thoughtful gifts wife under 100","experience gifts older woman"]}`;

async function gemini(prompt: string): Promise<string> {
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${KEY}`,
    {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 1.05,
          maxOutputTokens: MODEL.includes('flash') ? 6000 : 8000,
          responseMimeType: 'application/json',
          ...(MODEL.includes('flash') ? { thinkingConfig: { thinkingBudget: 0 } } : {}), // pay less
        },
      }),
    },
  );
  if (!r.ok) return '';
  return ((await r.json())?.candidates?.[0]?.content?.parts?.map((x: any) => x.text).join('') ?? '').trim(); // eslint-disable-line @typescript-eslint/no-explicit-any
}

const wc = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();

interface Row { message: string; queries: string[] }

function valid(r: any): r is Row { // eslint-disable-line @typescript-eslint/no-explicit-any
  if (!r || typeof r.message !== 'string' || r.message.trim().length < 4) return false;
  if (!Array.isArray(r.queries)) return false;
  const qs = r.queries.filter((q: any) => typeof q === 'string' && q.trim());
  if (qs.length < 2 || qs.length > 4) return false;
  const msgN = norm(r.message);
  for (const q of qs) {
    if (wc(q) < 1 || wc(q) > 7) return false;          // concise keywords only
    if (/^\s*\d+[.)]\s/.test(q)) return false;          // not a numbered list/answer
    if (norm(q) === msgN) return false;                 // not a verbatim echo
    if (msgN.length > 50 && norm(q).length > msgN.length * 0.8) return false; // not near-echo of long msg
  }
  if (new Set(qs.map(norm)).size < 2) return false;     // must be genuinely diverse
  r.queries = qs;
  return true;
}

function prompt(n: number, domains: string[]): string {
  return `You build training data for a tiny on-device model that converts ONE messy user message into a ` +
    `SET of 3 DIVERSE web-search queries (different angles), which a search engine then runs all of.\n\n` +
    `Generate ${n} realistic, VERY VARIED user messages. Draw their topics from these domains (mix them): ` +
    domains.join('; ') + `.\n` +
    `MIX the writing styles heavily — make some: ${STYLES.join('; ')}. Include real brand/model names, real ` +
    `places, real error messages, typos, personal context, and hard constraints. Vary LENGTH a lot ` +
    `(some 3 words, some a long emotional paragraph).\n\n` +
    `For EACH message produce "queries": an array of 3 search queries that attack it from DIFFERENT angles ` +
    `— e.g. one with the core keywords, one with the specific entity/error/model, one with the constraint or ` +
    `the broader category, or a synonym/year/forum-scoped variant. RULES for every query:\n` +
    `- concise KEYWORDS, max 7 words; drop filler/emotion/greetings/first-person.\n` +
    `- KEEP real entities (brands/models/places/error text) and the intent word (how to / fix / review / best / a year).\n` +
    `- space-separated words, NO "+" signs, NO numbered lists, NEVER the full message verbatim.\n` +
    `- the 3 queries must be genuinely different angles, not paraphrases of each other.\n\n` +
    ANCHORS + `\n\n` +
    `Return ONLY a JSON array of {"message": "...", "queries": ["...","...","..."]}.`;
}

async function main() {
  if (!KEY) { console.error('set GEMINI_API_KEY'); process.exit(2); }
  const N = process.env.N ? Number(process.env.N) : 60;
  const per = Math.min(20, N);
  const outDir = path.join(process.cwd(), 'lib/ai/eval/out');
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, process.env.OUT || 'querygen-data.jsonl');
  const ws = fs.createWriteStream(outFile, { flags: 'a' });
  const seen = new Set<string>();
  let kept = 0, batch = 0;

  for (let got = 0; got < N; got += per) {
    // rotate a window of 6 domains per batch so the full space gets covered
    const win: string[] = [];
    for (let k = 0; k < 6; k++) win.push(DOMAINS[(batch * 6 + k) % DOMAINS.length]);
    const raw = await gemini(prompt(Math.min(per, N - got), win)).catch(() => '');
    let arr: any[] = []; // eslint-disable-line @typescript-eslint/no-explicit-any
    try { arr = JSON.parse(raw); } catch { arr = []; }
    if (!Array.isArray(arr)) arr = [];
    let b = 0;
    for (const r of arr) {
      if (!valid(r)) continue;
      const key = norm(r.message).slice(0, 60);
      if (seen.has(key)) continue;
      seen.add(key);
      ws.write(JSON.stringify({ input: { message: r.message.trim() }, label: { queries: r.queries } }) + '\n');
      kept++; b++;
    }
    batch++;
    console.log(`batch ${batch}: +${b} (total kept ${kept})`);
  }
  ws.end();
  console.log(`\nwrote ${kept} multi-query examples → ${outFile}`);
}

main();
