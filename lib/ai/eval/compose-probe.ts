/**
 * Xonvert AI — long-form composition probe (Node, pure parts).
 *
 * Tests the prompt-sizing, outline parsing, gather-query fan-out, and assembly
 * of the WRITE engine — everything except the model calls themselves.
 *
 * Run:  npx tsx lib/ai/eval/compose-probe.ts
 */

import { workload, outlinePrompt, parseOutline, fallbackOutline, cleanGenerated, sectionPrompt, assemble, gatherQueries, type ComposeSpec } from '../compose';

const GREEN = (s: string) => `\x1b[32m${s}\x1b[0m`;
const RED = (s: string) => `\x1b[31m${s}\x1b[0m`;
const DIM = (s: string) => `\x1b[2m${s}\x1b[0m`;
let fails = 0;
function check(label: string, cond: boolean) { console.log(`${cond ? GREEN('✓') : RED('✗')} ${label}`); if (!cond) fails++; }

const long: ComposeSpec = { form: 'article', topic: 'how soccer affects society', length: 'long', lang: 'en' };
const poem: ComposeSpec = { form: 'poem', topic: 'the ocean', length: 'short', lang: 'en' };
const italian: ComposeSpec = { form: 'essay', topic: 'climate change', length: 'medium', lang: 'it' };

console.log('\nWorkload sizing\n');
check('long article = 4 sections (right-sized for a tiny model)', workload('long').sections === 4);
check('short = 1 section', workload('short').sections === 1);
check('long writes more tokens/section than short', workload('long').tokensPerSection > workload('short').tokensPerSection);

console.log('\nOutline prompt + parse\n');
const op = outlinePrompt(long);
check('outline schema is a JSON array of sections', /"sections"/.test(op.schema) && /array/.test(op.schema));
check('parseOutline reads model JSON', parseOutline('{"sections":["Origins","Economy","Identity"]}', long).length === 3);
check('parseOutline caps at workload count', parseOutline('{"sections":["a","b","c","d","e","f","g","h"]}', long).length === 4);
// The REAL-test bug: WASM model emits a numbered list, not JSON.
check('parseOutline reads a numbered list', parseOutline('1. Origins\n2. Economic impact\n3. Cultural identity', long).join('|') === 'Origins|Economic impact|Cultural identity');
check('parseOutline reads a bulleted list', parseOutline('- Causes\n- Effects\n- Outlook', long).length === 3);
// The REAL-test bug: model ignored the outline and wrote prose → must NOT
// collapse a long piece to one section; the scaffold guarantees structure.
check('long piece NEVER collapses to 1 section on junk', parseOutline('Why do cats purr? Well, they purr because…', long).length >= 2);
// The REAL-test bug #2: truncated/malformed JSON fragments must NOT become headings.
check('parseOutline rejects malformed-JSON fragments → scaffold', (() => {
  const o = parseOutline('{"sections": [\n  "title": "Why Cats Purr?",\n  "content": [', long);
  return o.length >= 2 && !o.some((h) => /["{}\[\]:]|title|sections|content/i.test(h));
})());
check('fallbackOutline sizes to workload + keeps intro/conclusion bookends', (() => { const o = fallbackOutline(long); return o.length === 4 && /intro/i.test(o[0]) && /conclu/i.test(o[o.length - 1]); })());
check('short piece still allows a single section', parseOutline('garbage', poem)[0] === poem.topic);

// The REAL-test bug: persona/instruction/CJK leakage must be stripped.
check('cleanGenerated strips "As an AI language model…"', !/as an ai/i.test(cleanGenerated('As an AI language model, I can say cats purr when happy. They also purr a lot.', 'en')));
check('cleanGenerated strips "No meta commentary"', !/meta.?commentary/i.test(cleanGenerated('Cats purr. No meta commentary needed! Just write about your cat.', 'en')));
check('cleanGenerated drops stray CJK for English', !/[一-鿿]/.test(cleanGenerated('Cats purr 为什么 when content.', 'en')));
check('cleanGenerated keeps CJK when target is Chinese', /[一-鿿]/.test(cleanGenerated('猫咪 purr 为什么', 'zh')));
// Live-test residual: "However I can provide you with some scientific reasons…" opener.
check('cleanGenerated strips "I can provide you…" lead-in', (() => { const t = cleanGenerated('However I can provide you with some scientific reasons why cats purr. Cats purr when content.', 'en'); return /cats purr when content/i.test(t) && !/i can provide you/i.test(t); })());
// Coffee-article bug: source/site names must NEVER appear in the prose.
check('cleanGenerated strips bare domains', !/researchgate\.net|ijpsjournal\.com/i.test(cleanGenerated('Caffeine boosts focus, per ijpsjournal.com and researchgate.net data.', 'en')));
check('cleanGenerated strips "as evidenced by … sources"', !/sources/i.test(cleanGenerated('Caffeine helps focus, as evidenced by findings from the journal sources. It is real.', 'en')));

console.log('\nSection prompts\n');
const heads = ['Origins', 'Economic impact', 'Cultural identity'];
const sp = sectionPrompt(long, 'Economic impact', heads, 'Soccer began as…');
check('section prompt names the heading', sp.messages[0].content.includes('Economic impact'));
check('section prompt lists siblings (avoid repeat)', sp.messages[1].content.includes('Cultural identity'));
check('section maxTokens = workload tokens', sp.maxTokens === workload('long').tokensPerSection);
const single = sectionPrompt(poem, 'the ocean', ['the ocean'], '');
check('single-section form writes the whole piece', single.messages[0].content.toLowerCase().includes('whole piece'));

console.log('\nLanguage carry-through\n');
check('non-English spec asks to write in that language', outlinePrompt(italian).messages[0].content.includes('Write in it'));

console.log('\nAssembly\n');
const doc = assemble(long, heads, ['Para A.', 'Para B.', 'Para C.']);
check('assembled doc has a title', doc.startsWith('# How Soccer Affects Society'));
check('assembled doc has section headings', doc.includes('## Economic impact'));
check('single-section assembly has no ## headings', !assemble(poem, ['the ocean'], ['Waves roll.']).includes('## '));

console.log('\nGather fan-out\n');
const qs = gatherQueries(long, heads);
check('long piece fans out into multiple research queries', qs.length > 1 && qs.length <= 7);
check('first query is the bare topic', qs[0] === long.topic);
check('short piece gathers fewer', gatherQueries(poem, ['the ocean']).length <= 3);

console.log(fails === 0 ? GREEN(`\nAll compose checks passed.\n`) : RED(`\n${fails} check(s) failed.\n`));
process.exit(fails === 0 ? 0 : 1);
