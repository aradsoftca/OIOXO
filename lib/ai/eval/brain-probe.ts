/**
 * Xonvert AI — end-to-end brain probe (Node).
 *
 * Runs the full deterministic spine: raw message → inferGoal → decideBrain, and
 * asserts the ACTION for each real request from the design discussion. Proves
 * the brain decides do/assist/search/chat correctly WITHOUT the model (the floor
 * the model only improves on).
 *
 * Run:  npx tsx lib/ai/eval/brain-probe.ts
 */

import { inferGoal, type GoalCtx } from '../goal';
import { decideBrain, type BrainDecision } from '../brain';

const GREEN = (s: string) => `\x1b[32m${s}\x1b[0m`;
const RED = (s: string) => `\x1b[31m${s}\x1b[0m`;
const DIM = (s: string) => `\x1b[2m${s}\x1b[0m`;

let fails = 0;
function fmt(d: BrainDecision): string {
  if (d.kind === 'chain') return `chain[${d.toolIds.join(' · ')}]`;
  if (d.kind === 'tool') return `tool:${d.toolId}`;
  if (d.kind === 'search') return `search("${d.query}")`;
  if (d.kind === 'assist') return `assist(${d.family})`;
  return d.kind;
}
function t(message: string, ctx: GoalCtx, expectKind: BrainDecision['kind'] | BrainDecision['kind'][], note = '') {
  const goal = inferGoal(message, ctx);
  const d = decideBrain(goal, { message, hasFile: ctx.hasFile, fileFamily: ctx.fileFamily });
  const want = Array.isArray(expectKind) ? expectKind : [expectKind];
  const ok = want.includes(d.kind);
  if (!ok) fails++;
  console.log(`${ok ? GREEN('✓') : RED('✗')} ${message.padEnd(40)} ${DIM('→ ' + fmt(d) + (d.kind === 'search' || d.kind === 'assist' ? ` [${d.lang}]` : ''))}${ok ? '' : RED(`  want ${want.join('|')}`)}${note ? DIM('   ' + note) : ''}`);
}

console.log('\nBrain decision (raw message → goal → action), deterministic floor\n');

// Composition no single tool serves → a discovered route (chain, or 1 tool if
// one tool spans it). Either way it's a DO, never search.
t('turn my mp3 into a bmp', {}, ['chain', 'tool'], 'audio→image→bmp');
t('convert this song to a bmp', { hasFile: true, fileFamily: 'audio' }, ['chain', 'tool']);

// Action-named single job (file present) → one TOOL via retrieval.
t('compress this', { hasFile: true, fileFamily: 'image' }, 'tool');
t('remove the background', { hasFile: true, fileFamily: 'image' }, 'tool');

// Factual question → SEARCH & answer (NOT a tool, NOT dead-ended).
t('what is bademjoon', {}, 'search');
t('what is my problem with ants', {}, 'search', 'not our domain → answer');

// Language-native answer.
t('in italiano dimmi cosa e bademjoon', {}, 'search', 'lang should be it');

// Blocked on a capability we have → ASSIST (offer to help).
t('why cant i edit my pdf', {}, 'assist');

// Chat.
t('hello!', {}, 'chat');
t('thank you', {}, 'chat');

// A direct format conversion → tool or chain (doc→pdf is one tool).
t('convert this to pdf', { hasFile: true, fileFamily: 'doc' }, 'tool', 'doc→pdf single edge');

// Matrix finding: a stray FORM noun must not trigger a write-job. "slugify …
// my blog post" mentions "blog" but is a text op — decideBrain must NOT return
// a job here (the live tool router then handles the text op).
t('slugify the title of my blog post', {}, 'search', 'NOT a job — no write verb');
// A bare command with no fitting tool stays useful (search), never dead-ends.
t('order me a pizza', {}, 'search', 'no tool fits → search, not dead-end');

console.log(fails === 0 ? GREEN(`\nAll brain decisions correct.\n`) : RED(`\n${fails} decision(s) wrong.\n`));
process.exit(fails === 0 ? 0 : 1);
