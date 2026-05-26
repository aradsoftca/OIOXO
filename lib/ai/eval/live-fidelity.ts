/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * live-fidelity — the HARD LIVE TEST of the #1 rule: the real answer must resolve the
 * RIGHT MEANING of an ambiguous request (serie a = football, NOT a TV series). Unlike
 * intent-fidelity (deterministic route+concept), this runs the full respond() with live
 * gather and checks the ANSWER TEXT: at least one right-sense word present, zero
 * wrong-sense words present, and the right action KIND. Failures = conductor training
 * targets. Run: npx tsx lib/ai/eval/live-fidelity.ts
 */
import { respond } from '../oioxo-engine';

type Case = {
  q: string;
  kind?: 'answer' | 'tool' | 'image' | 'game' | 'code';
  right?: string[];   // ≥1 must appear (right sense)
  wrong?: string[];   // none may appear (wrong sense = the disaster)
  cls: string;
};

const CASES: Case[] = [
  { q: 'serie a standings', cls: 'sense', kind: 'answer', right: ['football', 'italian', 'league', 'calcio', 'club'], wrong: ['tv series', 'episode', 'netflix', 'season finale', 'sitcom'] },
  { q: 'python snake facts', cls: 'sense', kind: 'answer', right: ['snake', 'reptile', 'species', 'constrict'], wrong: ['programming', 'code', 'language', 'developer'] },
  { q: 'amazon rainforest animals', cls: 'sense', kind: 'answer', right: ['forest', 'rainforest', 'species', 'south america', 'jungle'], wrong: ['stock', 'aws', 'prime', 'jeff bezos', 'ecommerce'] },
  { q: 'mercury the planet facts', cls: 'sense', kind: 'answer', right: ['planet', 'sun', 'solar', 'smallest'], wrong: ['poison', 'thermometer', 'roman god', 'messenger', 'freddie'] },
  { q: 'java the island', cls: 'sense', kind: 'answer', right: ['island', 'indonesia', 'jakarta'], wrong: ['programming', 'jvm', 'coffee', 'oracle'] },
  { q: 'jaguar animal habitat', cls: 'sense', kind: 'answer', right: ['cat', 'feline', 'wild', 'rainforest', 'predator'], wrong: ['car', 'land rover', 'sedan', 'engine', 'dealership'] },
  { q: 'apple fruit nutrition', cls: 'sense', kind: 'answer', right: ['fruit', 'fiber', 'vitamin', 'tree'], wrong: ['iphone', 'macbook', 'cupertino', 'ios'] },
  { q: 'turkey country population', cls: 'sense', kind: 'answer', right: ['country', 'ankara', 'istanbul', 'anatolia'], wrong: ['thanksgiving', 'poultry', 'gobble', 'roast'] },
  { q: 'bass fish habitat', cls: 'sense', kind: 'answer', right: ['fish', 'freshwater', 'lake', 'species'], wrong: ['guitar', 'amplifier', 'frequency', 'music'] },
  { q: 'what is the matrix movie about', cls: 'sense', kind: 'answer', right: ['film', 'neo', 'keanu', 'simulation', 'reality'], wrong: ['mathematics', 'rows and columns', 'linear algebra'] },
  { q: 'the office tv show cast', cls: 'sense', kind: 'answer', right: ['sitcom', 'steve carell', 'dunder', 'scranton', 'series'], wrong: ['workplace building', 'office space rent'] },
  { q: 'mac the cosmetics brand', cls: 'sense', kind: 'answer', right: ['cosmetic', 'makeup', 'beauty'], wrong: ['macbook', 'apple computer', 'operating system'] },
  // intent traps — a how-to QUESTION must be ANSWERED with steps, not launch our tool
  { q: 'how do I remove a background in photoshop', cls: 'howto-not-tool', kind: 'answer', right: ['select', 'layer', 'tool', 'click', 'step'] },
  { q: 'how to compress a video on my phone', cls: 'howto-not-tool', kind: 'answer' },
  { q: 'what is the best way to convert a pdf', cls: 'howto-not-tool', kind: 'answer' },
  // meta/self — must describe the assistant, never web-search
  { q: 'what can you do', cls: 'meta', kind: 'answer', right: ['convert', 'edit', 'files', 'answer'], wrong: ['wikipedia', 'according to'] },
  { q: 'are you chatgpt', cls: 'meta', kind: 'answer', right: ['oioxo', 'not'], wrong: ['openai released', 'language model developed'] },
  // analyze-at-the-moment (health) — understand + search + decide, right sense
  { q: 'is dark chocolate good for diabetics', cls: 'analyze', kind: 'answer', right: ['sugar', 'blood', 'diabet', 'glycemic', 'cocoa'] },
  // abbreviation sense
  { q: 'what does ram mean in computers', cls: 'abbr', kind: 'answer', right: ['memory', 'random access'], wrong: ['sheep', 'male sheep', 'dodge'] },
  // typo robustness (likely a conductor target if it fails)
  { q: 'waht is serie a', cls: 'typo', kind: 'answer', right: ['football', 'italian', 'calcio', 'league'], wrong: ['tv series', 'episode'] },
  // product/privacy/pricing — about US, never web-search the concept
  { q: 'is this free', cls: 'product', kind: 'answer', right: ['free', 'oioxo'], wrong: ['concept', 'emancipat', 'freedom is'] },
  { q: 'is my data safe', cls: 'product', kind: 'answer', right: ['device', 'private', 'local'], wrong: ['usb stick'] },
  { q: 'what file formats can you convert', cls: 'product', kind: 'answer', right: ['jpg', 'png', 'mp3', 'pdf'], wrong: ['office open xml'] },
  // transform with NO input → ASK for the text (agentic missing-input), not web-search
  { q: 'translate this to french', cls: 'need-input', kind: 'answer', right: ['paste', 'attach'], wrong: ['bible', 'medieval'] },
  { q: 'summarize this', cls: 'need-input', kind: 'answer', right: ['paste', 'attach'], wrong: ['automatic summarization'] },
  { q: 'proofread this', cls: 'need-input', kind: 'answer', right: ['paste', 'attach'], wrong: ['galley proof', 'publishing'] },
  // social / affirmations / frustration → graceful, never web-search
  { q: 'yes', cls: 'social', kind: 'answer', right: ['got it', 'what would you', 'do next'], wrong: ['yes or yes', 'affirmative particle', 'wikipedia'] },
  { q: 'sure', cls: 'social', kind: 'answer', right: ['got it', 'what would you', 'do next'], wrong: ['seemingly unrelated', 'regression'] },
  { q: 'this is stupid', cls: 'social', kind: 'answer', right: ['sorry', 'different approach', 'trying to do'], wrong: ['stupidity', 'art movement', 'lack of intelligence'] },
  { q: 'ok cool thanks', cls: 'social', kind: 'answer', right: ['welcome', 'anything else', 'glad'], wrong: [] },
  // time/date now → device clock, never web
  { q: 'what time is it', cls: 'now', kind: 'answer', right: ['where you are', ':'], wrong: ['nist', 'telephone'] },
  { q: "what's today's date", cls: 'now', kind: 'answer', right: ['today is', '2026'], wrong: ['nbc', 'streaming'] },
  // help → offer assistance, never web
  { q: 'help', cls: 'help', kind: 'answer', right: ['convert', 'edit', 'trying to do'], wrong: ['bollywood', '2010 film'] },
  { q: 'i need help', cls: 'help', kind: 'answer', right: ['convert', 'edit', 'trying to do'], wrong: ['look up', 'in your area', 'refer to'] },
  // unit/measure conversion → computed, never web-searched
  { q: 'convert 5 km to miles', cls: 'convert', kind: 'answer', right: ['3.1', 'miles'], wrong: ['conversion factor', 'wikipedia'] },
  { q: '100 fahrenheit to celsius', cls: 'convert', kind: 'answer', right: ['37', '°c'], wrong: ['formula', 'in order to convert'] },
  { q: 'how many ml in a cup', cls: 'convert', kind: 'answer', right: ['236', 'ml'], wrong: ['drinking cups may'] },
  // word definition → dictionary, never an offensive/irrelevant web snippet
  { q: 'what does ubiquitous mean', cls: 'define', kind: 'answer', right: ['everywhere', 'omnipresent', 'ubiquitous'], wrong: ['bbc', 'stereotype', 'acronym'] },
  // symbol/emoji-only → clarify/ack, never web-search
  { q: '?', cls: 'nocontent', kind: 'answer', right: ['ask', 'help', 'what you need'], wrong: ['punctuation', 'interrogation point'] },
];

async function one(c: Case): Promise<{ ok: boolean; why: string; kind: string; snip: string }> {
  let r: any;
  try { r = await Promise.race([respond(c.q), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 30000))]); }
  catch (e: any) { return { ok: false, why: 'ERR ' + e.message, kind: '-', snip: '' }; }
  const kind = r.tool ? 'tool' : r.openCode ? 'code' : r.game ? 'game' : (r.images?.length && !r.text) ? 'image' : 'answer';
  const text = (r.text || '').toLowerCase();
  if (c.kind && kind !== c.kind) return { ok: false, why: `kind ${kind}≠${c.kind}`, kind, snip: (r.text || r.tool?.name || '').slice(0, 80) };
  if (c.wrong?.some((w) => text.includes(w.toLowerCase()))) {
    const hit = c.wrong.find((w) => text.includes(w.toLowerCase()));
    return { ok: false, why: `WRONG-SENSE "${hit}"`, kind, snip: text.slice(0, 100) };
  }
  if (c.right && !c.right.some((w) => text.includes(w.toLowerCase()))) {
    return { ok: false, why: `no right-sense ${JSON.stringify(c.right)}`, kind, snip: text.slice(0, 100) };
  }
  return { ok: true, why: '', kind, snip: text.slice(0, 70) };
}

async function main() {
  const fails: { c: Case; r: Awaited<ReturnType<typeof one>> }[] = [];
  for (const c of CASES) {
    const r = await one(c);
    console.log(`${r.ok ? 'PASS' : 'FAIL'} [${c.cls}] ${c.q}  (${r.kind})${r.ok ? '' : '  → ' + r.why}`);
    if (!r.ok) fails.push({ c, r });
  }
  console.log(`\n=== LIVE FIDELITY ${CASES.length - fails.length}/${CASES.length} ===`);
  const byCls = new Map<string, [number, number]>();
  for (const c of CASES) { const e = byCls.get(c.cls) ?? [0, 0]; e[1]++; byCls.set(c.cls, e); }
  for (const { c } of fails) { const e = byCls.get(c.cls)!; e[0]++; }
  for (const [cls, [f, t]] of byCls) console.log(`  ${cls.padEnd(16)} ${t - f}/${t}${f ? '  ✗' : ''}`);
  if (fails.length) { console.log('\nFAILS (training targets):'); for (const { c, r } of fails) console.log(`  [${c.cls}] "${c.q}" → ${r.why}  | "${r.snip}"`); }
}
main().catch((e) => { console.error(e); process.exit(1); });
