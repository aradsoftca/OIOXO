/**
 * Xonvert AI — routing eval runner (Node, lexical layer).
 *
 * Scores the deterministic lexical ranker against the corpus and prints top-1 /
 * top-3 accuracy plus every miss, so we can see exactly where the brain is still
 * confused and tune the knowledge base. The semantic layer needs the on-device
 * model and isn't unit-testable here; lexical is the floor that always runs
 * first, so driving it up directly improves the live experience.
 *
 * Run:  npm run ai:eval
 */

import { searchTools } from '../retrieval';
import { indexDocs } from '../tool-index';
import { planRequest } from '../planner';
import { CORPUS, PLAN_CORPUS, type EvalCase } from './corpus';

const GREEN = (s: string) => `\x1b[32m${s}\x1b[0m`;
const RED = (s: string) => `\x1b[31m${s}\x1b[0m`;
const DIM = (s: string) => `\x1b[2m${s}\x1b[0m`;
const BOLD = (s: string) => `\x1b[1m${s}\x1b[0m`;

const KNOWN = new Set(indexDocs().map((d) => d.id));

function rankIds(query: string, n: number): string[] {
  return searchTools(query, { limit: n }).map((r) => r.doc.id);
}

function scoreSingle(cases: EvalCase[]) {
  let top1 = 0, top3 = 0;
  const misses: string[] = [];
  const phantom: string[] = [];

  for (const c of cases) {
    const unknown = c.expect.filter((id) => !KNOWN.has(id));
    if (unknown.length === c.expect.length) {
      // None of the expected ids exist in the registry — corpus needs fixing,
      // not the router. Flag separately so it doesn't pollute the accuracy read.
      phantom.push(`${DIM('phantom expect')} "${c.query}" → none of [${c.expect.join(', ')}] exist`);
      continue;
    }
    if (unknown.length) phantom.push(`${DIM('partial')} "${c.query}" → unknown id(s): ${unknown.join(', ')}`);

    const ranked = rankIds(c.query, 3);
    const hit1 = ranked[0] && c.expect.includes(ranked[0]);
    const hit3 = ranked.some((id) => c.expect.includes(id));
    if (hit1) top1++;
    if (hit3) top3++;
    if (!hit3) {
      misses.push(`${RED('MISS')} "${c.query}"\n      want: ${c.expect.join(' | ')}\n      got:  ${ranked.join(', ') || '(nothing)'}`);
    } else if (!hit1) {
      misses.push(`${DIM('top3')} "${c.query}" → wanted ${c.expect.join('|')}, top1 was ${ranked[0]}`);
    }
  }

  const n = cases.length - phantom.filter((p) => p.includes('phantom expect')).length;
  return { n, top1, top3, misses, phantom };
}

function scorePlans() {
  // Run the real planner and check it produces the expected ordered tool chain.
  let exact = 0;
  const total = PLAN_CORPUS.length;
  const detail: string[] = [];
  const gaps: string[] = [];
  for (const p of PLAN_CORPUS) {
    for (const step of p.steps) if (!KNOWN.has(step)) gaps.push(`${DIM('phantom step')} ${step} (in "${p.query}")`);
    const got = planRequest(p.query, { inputMedium: /\b(word|docx?)\b/i.test(p.query) ? 'doc' : undefined }).steps.map((s) => s.toolId);
    const ok = got.length === p.steps.length && got.every((id, i) => id === p.steps[i]);
    if (ok) exact++;
    else detail.push(`${RED('PLAN')} "${p.query}"\n      want: ${p.steps.join(' → ')}\n      got:  ${got.join(' → ') || '(empty)'}`);
  }
  return { exact, total, detail, gaps };
}

function pct(a: number, b: number): string {
  if (!b) return '—';
  const p = (100 * a) / b;
  const s = `${p.toFixed(1)}% (${a}/${b})`;
  return p >= 85 ? GREEN(s) : p >= 65 ? s : RED(s);
}

function main() {
  const en = CORPUS.filter((c) => !c.lang);
  const intl = CORPUS.filter((c) => c.lang);

  console.log(BOLD('\nXonvert AI — lexical routing eval\n'));
  console.log(DIM(`indexed tools: ${KNOWN.size}\n`));

  const r = scoreSingle(en);
  console.log(BOLD('English single-intent'));
  console.log(`  top-1: ${pct(r.top1, r.n)}    top-3: ${pct(r.top3, r.n)}`);

  const ri = scoreSingle(intl);
  if (ri.n) {
    console.log(BOLD('\nMultilingual (raw, pre-translation)'));
    console.log(`  top-1: ${pct(ri.top1, ri.n)}    top-3: ${pct(ri.top3, ri.n)}`);
  }

  const pl = scorePlans();
  console.log(BOLD('\nMulti-step plans (exact ordered chain)'));
  console.log(`  ${pct(pl.exact, pl.total)}`);
  for (const d of pl.detail) console.log('  ' + d);

  const allMisses = [...r.misses, ...ri.misses];
  if (allMisses.length) {
    console.log(BOLD('\nMisses & near-misses'));
    for (const m of allMisses) console.log('  ' + m);
  }

  const allPhantom = [...r.phantom, ...ri.phantom, ...pl.gaps];
  if (allPhantom.length) {
    console.log(BOLD('\nCorpus hygiene (fix the corpus, not the router)'));
    for (const p of allPhantom) console.log('  ' + p);
  }

  console.log('');
  // Non-zero exit if English top-3 dips below a floor, so CI can gate on it.
  const floor = 0.8;
  if (r.n && r.top3 / r.n < floor) {
    console.log(RED(`top-3 below ${floor * 100}% floor — failing.\n`));
    process.exit(1);
  }
}

main();
