/**
 * Xonvert AI — job planner probe (Node).
 *
 * Proves the COMPOSE-a-project planner is GENERAL across many forms + modifier
 * combinations (not fit to one example). Runs message → inferGoal → planJob and
 * checks the step pipeline.
 *
 * Run:  npx tsx lib/ai/eval/job-probe.ts
 */

import { inferGoal, type GoalCtx } from '../goal';
import { planJob, type JobStep } from '../job';

const GREEN = (s: string) => `\x1b[32m${s}\x1b[0m`;
const RED = (s: string) => `\x1b[31m${s}\x1b[0m`;
const DIM = (s: string) => `\x1b[2m${s}\x1b[0m`;

let fails = 0;
function sig(steps: JobStep[]): string {
  return steps.map((s) => {
    if (s.type === 'write') return `write:${s.form}/${s.length}`;
    if (s.type === 'package') return `package:${s.format}${s.supported ? '' : '✗'}`;
    if (s.type === 'gather') return `gather:${s.depth}`;
    return s.type;
  }).join(' → ');
}
function t(message: string, ctx: GoalCtx, expect: string[] | null, note = '') {
  const goal = inferGoal(message, ctx);
  const job = planJob(goal, message);
  const got = job ? job.steps.map((s) => s.type) : null;
  let ok: boolean;
  if (expect === null) ok = job === null;
  else ok = got !== null && got.length === expect.length && expect.every((e, i) => got[i] === e);
  if (!ok) fails++;
  const shown = job ? sig(job.steps) : DIM('(not a job)');
  console.log(`${ok ? GREEN('✓') : RED('✗')} ${message.slice(0, 52).padEnd(54)} ${DIM('→ ' + shown)}${ok ? '' : RED('  want ' + (expect ? expect.join('→') : 'null'))}${note ? DIM('  ' + note) : ''}`);
  if (job && note === 'show-topic') console.log(DIM(`       topic="${(job.steps.find((s) => s.type === 'write') as any)?.topic}"  ${job.summary}`));
}

console.log('\nJob planner — composition pipelines (deterministic)\n');

// The full multimodal article (the kind frontier LLMs truncate; we deliver).
t('write a detailed article about how soccer affects society, with images, as a pdf, and read it aloud',
  {}, ['gather', 'write', 'illustrate', 'package', 'voice'], 'show-topic');

// Creative, no research, short.
t('write me a poem about the ocean', {}, ['write']);
t('write a short story for kids about a dragon, as a pdf with illustrations and narrate it',
  {}, ['write', 'illustrate', 'package', 'voice']);

// Factual report → DOCX requested but unsupported (planned + flagged).
t('write a comprehensive report on renewable energy as a word document',
  {}, ['gather', 'write', 'package']);

// Blog with pictures (medium length, quick research).
t('draft a blog post about coffee culture with pictures', {}, ['gather', 'write', 'illustrate']);

// Short utility writing — no research.
t('write a cover letter for a software engineering job', {}, ['write']);
t('write a professional email asking for a deadline extension', {}, ['write']);

// A guide, in depth, as pdf.
t('create an in-depth guide to sourdough baking as a pdf', {}, ['gather', 'write', 'package']);

// NOT jobs — these belong to tool/answer/transform paths.
t('summarize this', { hasFile: true, fileFamily: 'pdf' }, null, 'tool op, not a job');
t('what is bademjoon', {}, null);
t('compress this image', { hasFile: true, fileFamily: 'image' }, null);
t('make a poster of taylor swift', {}, null, 'create/transform, not prose');

// --- topic cleanliness (the gather query must be tidy, no modifier noise) ----
import { cleanTopic } from '../job';
console.log('\nTopic extraction (clean research query)\n');
function tt(message: string, expect: string) {
  const got = cleanTopic(message);
  const ok = got === expect;
  if (!ok) fails++;
  console.log(`${ok ? GREEN('✓') : RED('✗')} ${message.slice(0, 50).padEnd(52)} ${DIM('→ "' + got + '"')}${ok ? '' : RED('  want "' + expect + '"')}`);
}
tt('write a detailed article about how soccer affects society, with images, as a pdf, and read it aloud', 'how soccer affects society');
tt('write a comprehensive report on renewable energy as a word document', 'renewable energy');
tt('draft a blog post about coffee culture with pictures', 'coffee culture');
tt('create an in-depth guide to sourdough baking as a pdf', 'sourdough baking');
tt('write me a poem about the ocean', 'ocean');
// Live bug: trailing "and then make pdf it" command must not pollute the title.
tt('write an article about affect coffee on body and then make pdf it', 'affect coffee on body');
tt('write a report on climate change and then make it a pdf', 'climate change');

console.log(fails === 0 ? GREEN(`\nAll job plans + topics correct.\n`) : RED(`\n${fails} check(s) wrong.\n`));
process.exit(fails === 0 ? 0 : 1);
