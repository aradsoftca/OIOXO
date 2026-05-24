/**
 * Xonvert AI — goal-extractor floor probe (Node).
 *
 * Tests the DETERMINISTIC floor (`inferGoal`, no model) against the real
 * requests from the design discussion + the failing transcript. The model only
 * refines this, so the floor must already be sane on its own.
 *
 * Run:  npx tsx lib/ai/eval/goal-probe.ts
 */

import { inferGoal, type GoalCtx } from '../goal';

const GREEN = (s: string) => `\x1b[32m${s}\x1b[0m`;
const RED = (s: string) => `\x1b[31m${s}\x1b[0m`;
const DIM = (s: string) => `\x1b[2m${s}\x1b[0m`;

let fails = 0;
type Expect = { intent?: string; from?: string | null; to?: string | null; lang?: string };
function t(text: string, ctx: GoalCtx, exp: Expect) {
  const g = inferGoal(text, ctx);
  const probs: string[] = [];
  if (exp.intent !== undefined && g.intent !== exp.intent) probs.push(`intent=${g.intent}≠${exp.intent}`);
  if (exp.from !== undefined && g.from !== exp.from) probs.push(`from=${g.from}≠${exp.from}`);
  if (exp.to !== undefined && g.to !== exp.to) probs.push(`to=${g.to}≠${exp.to}`);
  if (exp.lang !== undefined && g.lang !== exp.lang) probs.push(`lang=${g.lang}≠${exp.lang}`);
  const ok = probs.length === 0;
  if (!ok) fails++;
  console.log(`${ok ? GREEN('✓') : RED('✗')} ${text.padEnd(42)} ${DIM(`→ {${g.intent}, from:${g.from}, to:${g.to}, lang:${g.lang}}`)}${ok ? '' : RED('  ' + probs.join(' '))}`);
}

console.log('\nGoal extraction (deterministic floor)\n');

// Composition: a goal no single tool serves — must read as transform audio→bmp.
t('turn my mp3 into a bmp', {}, { intent: 'transform', from: 'audio', to: 'bmp' });
t('convert this song to bmp', { hasFile: true, fileFamily: 'audio' }, { intent: 'transform', from: 'audio', to: 'bmp' });

// Tool-able request with a file.
t('compress this', { hasFile: true, fileFamily: 'image' }, { intent: 'transform', from: 'image' });

// Create something new.
t('make a poster of taylor swift', {}, { intent: 'create' });
t('generate a qr code', {}, { intent: 'create' });

// Factual question → answer (NOT a tool, NOT force-search-labelled later).
t('what is bademjoon', {}, { intent: 'answer', lang: 'en' });
t('what is my problem with ants', {}, { intent: 'answer' });

// Language-native: answer in Italian.
t('in italiano dimmi cosa e bademjoon', {}, { intent: 'answer', lang: 'it' });

// Blocked/struggling about a capability we have → assist (offer to help).
t('why cant i edit my pdf', {}, { intent: 'assist', from: 'pdf' });
t('how do i edit my pdf', { }, { intent: 'assist' });

// Chat.
t('hi there', {}, { intent: 'chat' });
t('thanks!', {}, { intent: 'chat' });

console.log(fails === 0 ? GREEN(`\nAll goal cases passed.\n`) : RED(`\n${fails} case(s) failed.\n`));
process.exit(fails === 0 ? 0 : 1);
