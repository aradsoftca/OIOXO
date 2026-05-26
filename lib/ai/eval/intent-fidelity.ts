/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * intent-fidelity — the HARD TEST for the #1 rule: answer what was ASKED, never
 * something else ("serie a" → the football league, NOT a TV series).
 *
 * Runs the deterministic brain front-door — decideRoute (what KIND of action) and
 * comprehendAnswer (the CONCEPT we'll actually search) — over adversarial prompts:
 * sense-ambiguous homonyms, action-on-file vs topic-question, multi-word entities a
 * stopword-stripper can mangle, mixed/chained intent, and the structural routes
 * (game/code/image/app/compute/geo). Each case asserts the right ROUTE and, for
 * answers, that the CONCEPT preserves the real entity (the part first version got
 * wrong). Failures bucket by CLASS so we fix the mechanism, then re-run.
 *
 * Pure / no network — exposes routing + concept-extraction dumbness instantly.
 * Run: npx tsx lib/ai/eval/intent-fidelity.ts
 */
import { decideRoute, comprehendAnswer, type FileCat } from '../oioxo-engine';

type Case = {
  prompt: string;
  file?: FileCat;
  cls: string;
  route: string;                 // expected route kind
  concept?: string | string[];   // for answers: substring(s) the concept MUST keep
  notConcept?: string;           // a wrong sense the concept must NOT collapse to
};

const CASES: Case[] = [
  // ── SENSE / HOMONYM — answer the right MEANING (the headline failure) ──
  { prompt: 'serie a standings', cls: 'sense', route: 'answer', concept: 'serie a' },
  { prompt: 'who is winning serie a this season', cls: 'sense', route: 'answer', concept: 'serie a' },
  { prompt: 'python snake facts', cls: 'sense', route: 'answer', concept: 'python', notConcept: 'programming' },
  { prompt: 'how do I sort a list in python', cls: 'sense', route: 'answer', concept: 'python' },
  { prompt: 'amazon rainforest animals', cls: 'sense', route: 'answer', concept: 'amazon rainforest' },
  { prompt: 'amazon stock price', cls: 'sense', route: 'answer', concept: 'amazon' },
  { prompt: 'mercury the planet facts', cls: 'sense', route: 'answer', concept: 'mercury' },
  { prompt: 'is mercury dangerous to touch', cls: 'sense', route: 'answer', concept: 'mercury' },
  { prompt: 'java the island', cls: 'sense', route: 'answer', concept: 'java' },
  { prompt: 'apple nutrition facts', cls: 'sense', route: 'answer', concept: 'apple' },
  { prompt: 'turkey the country population', cls: 'sense', route: 'answer', concept: 'turkey' },

  // ── MULTI-WORD ENTITY a stopword stripper can mangle (keep the whole name) ──
  { prompt: 'what is the matrix about', cls: 'entity', route: 'answer', concept: 'matrix' },
  { prompt: 'the the band history', cls: 'entity', route: 'answer', concept: 'the' },
  { prompt: 'us open tennis schedule', cls: 'entity', route: 'answer', concept: 'us open' },
  { prompt: 'a tribe called quest albums', cls: 'entity', route: 'answer', concept: 'tribe called quest' },

  // ── ACTION-ON-FILE (tool) vs TOPIC-QUESTION (answer) — must not swap ──
  { prompt: 'compress this', file: 'image', cls: 'action-vs-topic', route: 'tool' },
  { prompt: 'what is image compression', cls: 'action-vs-topic', route: 'answer', concept: 'image compression' },
  { prompt: 'remove the background', file: 'image', cls: 'action-vs-topic', route: 'tool' },
  { prompt: 'how do I remove a background in photoshop', cls: 'action-vs-topic', route: 'answer' },
  { prompt: 'convert to mp3', file: 'audio', cls: 'action-vs-topic', route: 'tool' },
  { prompt: 'what does mp3 stand for', cls: 'action-vs-topic', route: 'answer', concept: 'mp3' },
  { prompt: 'pdf to images', cls: 'action-vs-topic', route: 'tool' },

  // ── MIXED / CHAINED intent — the lead action wins, the rest chains ──
  { prompt: 'convert this pdf to jpg and email it to my mom', file: 'pdf', cls: 'chain', route: 'tool' },
  { prompt: 'resize this then add a watermark', file: 'image', cls: 'chain', route: 'tool' },

  // ── STRUCTURAL routes that must NOT be answered as questions ──
  { prompt: "let's play chess", cls: 'structural', route: 'game' },
  { prompt: 'how do you play chess', cls: 'structural', route: 'answer' },   // explain, NOT launch
  { prompt: 'what is 15% of 240', cls: 'structural', route: 'answer' },      // compute path inside respond()
  { prompt: 'show me pictures of the eiffel tower', cls: 'structural', route: 'image', concept: 'eiffel tower' },
  { prompt: 'review this code\n```js\nconst x=1\n```', cls: 'structural', route: 'code' },

  // ── QUESTION shapes that must stay answers (not hijacked by a stray keyword) ──
  { prompt: 'salt and pepper', cls: 'hijack', route: 'answer' },             // NOT the password-salt tool
  { prompt: 'why is the sky blue', cls: 'hijack', route: 'answer', concept: 'sky' },
  { prompt: 'best laptop for programming', cls: 'hijack', route: 'answer' },

  // ── INFO QUESTION about a thing we ALSO have a tool for → ANSWER, not launch tool ──
  { prompt: 'what is base64', cls: 'info-not-tool', route: 'answer', concept: 'base64' },
  { prompt: 'what is base64 encoding', cls: 'info-not-tool', route: 'answer' },
  { prompt: 'what is a qr code', cls: 'info-not-tool', route: 'answer' },
  { prompt: 'what is markdown', cls: 'info-not-tool', route: 'answer' },
  { prompt: 'what is json', cls: 'info-not-tool', route: 'answer' },
  { prompt: 'what is a hash function', cls: 'info-not-tool', route: 'answer' },
  { prompt: 'what is a webp file', cls: 'info-not-tool', route: 'answer' },
  { prompt: 'how does rot13 work', cls: 'info-not-tool', route: 'answer' },
  { prompt: 'explain how url encoding works', cls: 'info-not-tool', route: 'answer' },
  { prompt: 'tell me about lorem ipsum', cls: 'info-not-tool', route: 'answer' },

  // ── CONTROL: real imperative tool requests must STILL route to tool (no over-correction) ──
  { prompt: 'make a qr code', cls: 'tool-control', route: 'tool' },
  { prompt: 'generate a password', cls: 'tool-control', route: 'tool' },
  { prompt: 'encode hello in base64', cls: 'tool-control', route: 'tool' },
  { prompt: 'count the words', file: 'text', cls: 'tool-control', route: 'tool' },

  // ── META: questions about the AI itself must NOT be web-searched (talk/identity) ──
  { prompt: 'what can you do', cls: 'meta', route: 'chat' },
  { prompt: 'who are you', cls: 'meta', route: 'chat' },
  { prompt: 'what are you', cls: 'meta', route: 'chat' },
  { prompt: 'are you chatgpt', cls: 'meta', route: 'chat' },

  // ── COMPARE formats/tools (informational) → answer, not a tool ──
  { prompt: 'png vs jpg which is better', cls: 'compare-fmt', route: 'answer' },
  { prompt: 'should i use pdf or word', cls: 'compare-fmt', route: 'answer' },

  // ── PRODUCT/PRIVACY/PRICING/FORMATS meta → must NOT web-search (answer about us) ──
  { prompt: 'is this free', cls: 'product', route: 'chat' },
  { prompt: 'how much does it cost', cls: 'product', route: 'chat' },
  { prompt: 'is my data safe', cls: 'product', route: 'chat' },
  { prompt: 'where are my files stored', cls: 'product', route: 'chat' },
  { prompt: 'do you work offline', cls: 'product', route: 'chat' },
  { prompt: 'what file formats can you convert', cls: 'product', route: 'chat' },

  // ── CONTROL: real-world look-alikes must STILL be answered from the web ──
  { prompt: 'how much does it cost to fly to paris', cls: 'product-control', route: 'answer' },
  { prompt: 'is it safe to eat raw eggs', cls: 'product-control', route: 'answer' },
  { prompt: 'how much does a tesla cost', cls: 'product-control', route: 'answer' },
];

function conceptOk(got: string, want?: string | string[], notWant?: string): boolean {
  if (!want && !notWant) return true;
  const g = got.toLowerCase();
  const wants = Array.isArray(want) ? want : want ? [want] : [];
  if (!wants.every((w) => g.includes(w.toLowerCase()))) return false;
  if (notWant && g.includes(notWant.toLowerCase())) return false;
  return true;
}

function main() {
  const fails: { c: Case; gotRoute: string; gotConcept: string; why: string }[] = [];
  for (const c of CASES) {
    const r = decideRoute(c.prompt, c.file ?? null);
    const plan = comprehendAnswer(c.prompt);
    const concept = plan.concept || '';
    let why = '';
    if (r.kind !== c.route) why = `route ${r.kind}≠${c.route}`;
    else if (c.route === 'answer' && !conceptOk(concept, c.concept, c.notConcept)) {
      why = `concept "${concept}" missing/expected ${JSON.stringify(c.concept)}${c.notConcept ? ` / must-not "${c.notConcept}"` : ''}`;
    } else if (c.route === 'image' && c.concept && !conceptOk(r.subject || concept, c.concept)) {
      why = `image subject "${r.subject}" missing ${JSON.stringify(c.concept)}`;
    }
    if (why) fails.push({ c, gotRoute: r.kind, gotConcept: concept, why });
  }

  const byCls = new Map<string, number>();
  for (const c of CASES) byCls.set(c.cls, (byCls.get(c.cls) ?? 0) + 1);
  const failByCls = new Map<string, number>();
  for (const f of fails) failByCls.set(f.c.cls, (failByCls.get(f.c.cls) ?? 0) + 1);

  console.log(`\n=== INTENT FIDELITY — ${CASES.length - fails.length}/${CASES.length} pass ===\n`);
  console.log('By class (pass/total):');
  for (const [cls, total] of byCls) {
    const f = failByCls.get(cls) ?? 0;
    console.log(`  ${cls.padEnd(16)} ${total - f}/${total}${f ? '  ✗' : ''}`);
  }
  if (fails.length) {
    console.log('\nFAILURES (the dumbness to fix → conductor training targets):');
    for (const f of fails) console.log(`  [${f.c.cls}] "${f.c.prompt.replace(/\n/g, ' ')}"\n     → ${f.why}`);
  }
  console.log('');
}
main();
