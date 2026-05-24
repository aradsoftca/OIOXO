/**
 * oioxo COMPREHENSION trainer. Two layers, both probed here:
 *   1. analyzeQuestion — does it read the SHAPE (single/compare/explain/list)
 *      and, for a comparison, isolate the two things being weighed?
 *   2. comprehendAnswer — the unified "understand the concept, then decide how to
 *      LEARN and how to ORGANIZE" layer that fronts every answer prompt. We check
 *      the shape + gather strategy + organize strategy it plans.
 *
 * This is the "understand at the moment, then handle it the right way" layer —
 * grow the corpus to surface the dumb classes millions of prompts would.
 *
 *   npx tsx lib/ai/eval/oioxo-shape-eval.ts
 */
import { analyzeQuestion, type QuestionKind } from '../reason';
import { comprehendAnswer, type AnswerShape, type AnswerPlan } from '../oioxo-engine';

// --- 1) shape + entity extraction (analyzeQuestion) ------------------------
const SHAPE: [string, QuestionKind, string[]?][] = [
  ['i need a new bike, i dont know fuji is better or canadian tire', 'compare', ['fuji', 'canadian tire']],
  ['which is better, iphone or android', 'compare', ['iphone', 'android']],
  ['fuji vs canadian tire', 'compare', ['fuji', 'canadian tire']],
  ['should i buy a ps5 or xbox', 'compare', ['ps5', 'xbox']],
  ['difference between python and java', 'compare', ['python', 'java']],
  ['is coffee or tea better for you', 'compare', ['coffee', 'tea']],
  ['how do volcanoes form or erupt', 'explain'],
  ['what is the best laptop', 'list'],
  ['how do i train a puppy', 'explain'],
  ['what is the capital of japan', 'single'],
  ['who is taylor swift', 'single'],
];

// --- 2) full understanding (comprehendAnswer) ------------------------------
// [prompt, expected shape, expected gather, expected organize]
const PLAN: [string, AnswerShape, AnswerPlan['gather'], AnswerPlan['organize']][] = [
  ['how they make ghormeh sabzi', 'recipe', 'structured', 'extract'],
  ['recipe for lasagna', 'recipe', 'structured', 'extract'],
  ['how to tie a tie', 'howto', 'structured', 'extract'],
  ['python read a file', 'code', 'structured', 'extract'],
  ['i need a new bike, i dont know fuji is better or canadian tire', 'compare', 'per-entity', 'recommend'],
  ['mac vs windows for coding', 'compare', 'per-entity', 'recommend'],
  ['why is the sky blue', 'explain', 'facets', 'explain'],
  ['how do volcanoes form', 'explain', 'facets', 'explain'],
  ['what is photosynthesis', 'define', 'facets', 'define'],
  ['what is the capital of japan', 'define', 'facets', 'define'],
  ['who won the 2014 world cup', 'fact', 'facets', 'state'],
  ['best laptops for students', 'list', 'facets', 'state'],
];

let ok = 0;
const fails: string[] = [];

for (const [prompt, kind, entities] of SHAPE) {
  const a = analyzeQuestion(prompt);
  let pass = a.kind === kind;
  if (pass && entities) {
    const got = a.topics.map((t) => t.toLowerCase());
    pass = entities.length === got.length && entities.every((e, i) => got[i] === e.toLowerCase());
  }
  if (pass) ok++;
  else fails.push(`  [shape] "${prompt}"\n      want ${kind}${entities ? ' ' + JSON.stringify(entities) : ''}  got ${a.kind} ${JSON.stringify(a.topics)}`);
}

for (const [prompt, shape, gather, organize] of PLAN) {
  const p = comprehendAnswer(prompt);
  if (p.shape === shape && p.gather === gather && p.organize === organize) ok++;
  else fails.push(`  [plan]  "${prompt}"\n      want ${shape}/${gather}/${organize}  got ${p.shape}/${p.gather}/${p.organize}`);
}

const total = SHAPE.length + PLAN.length;
console.log(`\n=== oioxo comprehension eval: ${ok}/${total} = ${Math.round((ok / total) * 100)}% ===`);
if (!fails.length) console.log('Every prompt understood + planned correctly 🎉');
else { console.log('\n--- misreads ---'); for (const f of fails) console.log(f); }
