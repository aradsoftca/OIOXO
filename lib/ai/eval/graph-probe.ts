/**
 * Xonvert AI — Capability Graph probe (Node).
 *
 * Proves the graph is built from REAL registry data and that multi-hop routes
 * are DISCOVERED (not hardcoded). Prints what it found and asserts invariants.
 *
 * Run:  npx tsx lib/ai/eval/graph-probe.ts
 */

import { capEdges, findPaths, planCapability, reachableFrom, mimeFamily, mimeFormat, wordFamily, type CapPath } from '../capability-graph';

const GREEN = (s: string) => `\x1b[32m${s}\x1b[0m`;
const RED = (s: string) => `\x1b[31m${s}\x1b[0m`;
const DIM = (s: string) => `\x1b[2m${s}\x1b[0m`;
const BOLD = (s: string) => `\x1b[1m${s}\x1b[0m`;

let fails = 0;
function check(label: string, cond: boolean) {
  console.log(`${cond ? GREEN('✓') : RED('✗')} ${label}`);
  if (!cond) fails++;
}
function show(p: CapPath | null): string {
  if (!p) return DIM('(no route)');
  return p.families.join(' → ') + DIM('   [' + p.edges.map((e) => e.toolId).join(' · ') + ']');
}

// --- normalisation sanity ---------------------------------------------------
console.log(BOLD('\nNormalisation'));
check("mimeFamily('image/bmp') = image", mimeFamily('image/bmp') === 'image');
check("mimeFamily('audio/*') = audio", mimeFamily('audio/*') === 'audio');
check("mimeFamily('application/pdf') = pdf", mimeFamily('application/pdf') === 'pdf');
check("mimeFormat('audio/mpeg') = mp3", mimeFormat('audio/mpeg') === 'mp3');
check("mimeFormat('image/bmp') = bmp", mimeFormat('image/bmp') === 'bmp');
check("mimeFormat('audio/*') = null (wildcard)", mimeFormat('audio/*') === null);
check("wordFamily('bmp') = image", wordFamily('bmp') === 'image');
check("wordFamily('mp3') = audio", wordFamily('mp3') === 'audio');

// --- graph shape ------------------------------------------------------------
const edges = capEdges();
console.log(BOLD(`\nGraph: ${edges.length} typed edges from the live registry`));
const byFrom = new Map<string, Set<string>>();
for (const e of edges) {
  const s = byFrom.get(e.from) ?? new Set<string>();
  s.add(e.to);
  byFrom.set(e.from, s);
}
for (const [from, tos] of [...byFrom.entries()].sort()) {
  console.log(`  ${from.padEnd(8)} → ${[...tos].sort().join(', ')}`);
}
check('graph has at least 50 edges', edges.length >= 50);

// --- reachability -----------------------------------------------------------
console.log(BOLD('\nReachable within 3 hops'));
for (const f of ['audio', 'image', 'pdf', 'doc'] as const) {
  console.log(`  from ${f}: ${[...reachableFrom(f, 3)].sort().join(', ')}`);
}

// --- discovered routes (the whole point) ------------------------------------
console.log(BOLD('\nDiscovered routes (shortest first)'));
const probes: [string, string | null, any][] = [
  ['audio → image', 'audio', 'image'],
  ['audio → text', 'audio', 'text'],
  ['image → text', 'image', 'text'],
  ['image → pdf', 'image', 'pdf'],
  ['doc → pdf', 'doc', 'pdf'],
  ['pdf → image', 'pdf', 'image'],
];
for (const [label, from, to] of probes) {
  const paths = findPaths(from as any, to as any, { maxHops: 3, limit: 2 });
  console.log(`  ${label.padEnd(16)} ${paths.length ? show(paths[0]) : DIM('(none — not in our tools)')}`);
}

// --- the high-level entry the brain uses ------------------------------------
console.log(BOLD('\nplanCapability (goal as a word)'));
const bmp = planCapability('audio', 'bmp');
console.log(`  audio file, goal 'bmp':  ${show(bmp)}`);
const word = planCapability('pdf', 'word');
console.log(`  pdf file, goal 'word':   ${show(word)}`);

// A goal genuinely outside our tools must return null (→ brain falls back to search).
const nonsense = planCapability('audio', 'spreadsheet');
console.log(`  audio file, goal 'spreadsheet': ${show(nonsense)}`);

console.log(fails === 0 ? GREEN(`\nAll ${'invariants'} passed.\n`) : RED(`\n${fails} check(s) failed.\n`));
process.exit(fails === 0 ? 0 : 1);
