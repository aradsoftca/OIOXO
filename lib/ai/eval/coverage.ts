/**
 * Xonvert AI — capability coverage report.
 *
 * For every tool in the registry, works out whether the AI can run it INLINE
 * (and via which mechanism) or only hand it off to its page, plus how much
 * curated knowledge (utterances/details) backs it. This is the map for deciding
 * what to wire next, and a regression signal — if a refactor silently drops a
 * runner, the inline count moves.
 *
 * Run:  npm run ai:coverage
 */

import { TOOLS } from '@/lib/registry';
import { inlineCap } from '../capabilities';
import { textOpFor } from '../text-ops';
import { devOpFor } from '../dev-ops';
import { colorOpFor } from '../color-ops';
import { calcOpFor } from '../calc-ops';
import { gameOpFor, isGameRandom } from '../game-ops';
import { isTimeOp } from '../time-ops';
import { isMathOp } from '../math-ops';
import { isFinanceOp } from '../finance-ops';
import { subtitleOpFor } from '../subtitle-ops';
import { cssOpFor } from '../css-ops';
import { seoOpFor } from '../seo-ops';
import { combineFor } from '../combine';
import { hasRunner } from '../executor';
import { knowledgeFor, hasDetail } from '../knowledge';

const BOLD = (s: string) => `\x1b[1m${s}\x1b[0m`;
const DIM = (s: string) => `\x1b[2m${s}\x1b[0m`;
const GREEN = (s: string) => `\x1b[32m${s}\x1b[0m`;
const YELLOW = (s: string) => `\x1b[33m${s}\x1b[0m`;

/** How (if at all) the AI can execute this tool inline. */
function mechanism(id: string): string | null {
  if (inlineCap(id)) return 'capability';   // image/audio/video runners
  if (textOpFor(id)) return 'text-op';
  if (devOpFor(id)) return 'dev-op';
  if (colorOpFor(id)) return 'color-op';
  if (calcOpFor(id)) return 'calc-op';
  if (gameOpFor(id) || isGameRandom(id)) return 'game-op';
  if (isTimeOp(id)) return 'time-op';
  if (isMathOp(id)) return 'math-op';
  if (isFinanceOp(id)) return 'finance-op';
  if (subtitleOpFor(id)) return 'subtitle-op';
  if (cssOpFor(id)) return 'css-op';
  if (seoOpFor(id)) return 'seo-op';
  if (combineFor(id)) return 'combine';
  if (hasRunner(id)) return 'engine-runner'; // pdf/doc/convert via executor
  return null;
}

function bar(n: number, total: number, width = 24): string {
  const filled = total ? Math.round((n / total) * width) : 0;
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

function main() {
  const byMech = new Map<string, number>();
  const byCat = new Map<string, { run: number; total: number }>();
  let runnable = 0, withUtter = 0, withDetail = 0;
  const handoffByCat = new Map<string, string[]>();

  for (const t of TOOLS) {
    const cat = t.category;
    const c = byCat.get(cat) ?? { run: 0, total: 0 };
    c.total++;
    const mech = mechanism(t.id);
    if (mech) {
      runnable++;
      c.run++;
      byMech.set(mech, (byMech.get(mech) ?? 0) + 1);
    } else {
      const list = handoffByCat.get(cat) ?? [];
      list.push(t.id);
      handoffByCat.set(cat, list);
    }
    byCat.set(cat, c);
    if (knowledgeFor(t).utterances.length) withUtter++;
    if (hasDetail(t.id)) withDetail++;
  }

  const total = TOOLS.length;
  console.log(BOLD('\nXonvert AI — capability coverage\n'));
  console.log(`${BOLD('Inline-runnable')}  ${GREEN(`${runnable}/${total}`)} (${((100 * runnable) / total).toFixed(1)}%)  ${bar(runnable, total)}`);
  console.log(`${DIM('Curated utterances')}  ${withUtter}/${total}    ${DIM('Curated details')}  ${withDetail}/${total}\n`);

  console.log(BOLD('By mechanism'));
  for (const [m, n] of [...byMech.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${m.padEnd(15)} ${n}`);

  console.log(BOLD('\nBy category  (inline / total)'));
  for (const [cat, c] of [...byCat.entries()].sort((a, b) => b[1].total - a[1].total)) {
    const pct = c.total ? (100 * c.run) / c.total : 0;
    const color = pct >= 50 ? GREEN : pct > 0 ? YELLOW : DIM;
    console.log(`  ${cat.padEnd(10)} ${color(`${String(c.run).padStart(3)}/${String(c.total).padEnd(3)}`)} ${bar(c.run, c.total, 16)}`);
  }

  // Where the biggest hand-off gaps are — the wiring backlog.
  console.log(BOLD('\nLargest hand-off gaps (candidates to wire next)'));
  const gaps = [...handoffByCat.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 5);
  for (const [cat, ids] of gaps) console.log(`  ${cat.padEnd(10)} ${ids.length}  ${DIM(ids.slice(0, 6).join(', ') + (ids.length > 6 ? '…' : ''))}`);

  console.log('');
}

main();
