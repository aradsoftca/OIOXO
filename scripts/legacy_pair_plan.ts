// Classify every historical root URL (scripts/legacy_pairs_gsc.json) against what the product can do.
//   tsx scripts/legacy_pair_plan.ts [scripts/legacy_pairs_gsc.json]
// (a) already a CONVERT_PAIR before lib/convert/legacy-pairs.ts
// (b) a real route: targetsFor(from) offers `to` (aliases equal) and legacyExclusion() does not veto it
// (c) unsupported — left on its old redirect; the top of this list is a product-idea backlog.
// Also checks that every (b) has a page in LEGACY_PAIR_LIST and that legacyDestination() lands on it.
import { readFileSync } from 'node:fs';
import { targetsFor } from '@/lib/convert/matrix';
import { CONVERT_PAIRS } from '@/lib/convert/pairs';
import { LEGACY_PAIR_LIST, legacyExclusion } from '@/lib/convert/legacy-pairs';
import { legacyDestination } from '@/lib/convert/legacy';

type Row = { from: string; to: string; impr: number; clicks: number };
const rows: Row[] = JSON.parse(readFileSync(process.argv[2] ?? 'scripts/legacy_pairs_gsc.json', 'utf8'));

const CANON: Record<string, string> = { jpeg: 'jpg', tif: 'tiff', htm: 'html', mpeg: 'mpg', yml: 'yaml', markdown: 'md' };
const cn = (e: string): string => CANON[e] ?? e;
const slug = (f: string, t: string): string => `${f}-to-${t}`;

const legacy = new Set(LEGACY_PAIR_LIST.map(([f, t]) => slug(f, t)));
const original = new Set(CONVERT_PAIRS.map((p) => slug(p.from, p.to)).filter((s) => !legacy.has(s)));

const cls: Record<'a' | 'b' | 'c', Row[]> = { a: [], b: [], c: [] };
const vetoed: (Row & { why: string })[] = [];
const toolOf = new Map<string, string>();
for (const r of rows) {
  const f = r.from.toLowerCase(), t = r.to.toLowerCase();
  if (original.has(slug(f, t)) || original.has(slug(cn(f), cn(t)))) { cls.a.push(r); continue; }
  const hit = cn(f) === cn(t) ? undefined : targetsFor(cn(f)).find((x) => cn(x.to) === cn(t));
  if (!hit) { cls.c.push(r); continue; }
  const why = legacyExclusion(cn(f), cn(t));
  if (why) { vetoed.push({ ...r, why }); cls.c.push(r); continue; }
  toolOf.set(slug(f, t), hit.toolId);
  cls.b.push(r);
}

const sum = (l: Row[], k: 'impr' | 'clicks'): number => l.reduce((n, r) => n + r[k], 0);
for (const k of ['a', 'b', 'c'] as const) console.log(`(${k}) ${cls[k].length} pairs, ${sum(cls[k], 'impr')} impr, ${sum(cls[k], 'clicks')} clicks`);

console.log('\nTop 40 (b) by impressions:');
for (const r of cls.b.slice(0, 40)) console.log(`  ${slug(r.from, r.to)}  ${r.impr} impr  ${r.clicks} clk  matrix tool: ${toolOf.get(slug(r.from.toLowerCase(), r.to.toLowerCase()))}`);

console.log('\nTop 30 (c) by impressions:');
for (const r of cls.c.slice(0, 30)) console.log(`  ${slug(r.from, r.to)}  ${r.impr} impr  ${r.clicks} clk`);

console.log('\nMatrix routes vetoed as not honest:');
for (const r of vetoed) console.log(`  ${slug(r.from, r.to)}  ${r.impr} impr  — ${r.why}`);

let bad = 0;
for (const r of cls.b) {
  const s = slug(cn(r.from.toLowerCase()), cn(r.to.toLowerCase()));
  if (!legacy.has(s)) { bad++; console.log(`MISSING page for (b) ${s}`); }
  const d = legacyDestination(slug(r.from.toLowerCase(), r.to.toLowerCase()));
  if (d !== `/convert/${s}`) { bad++; console.log(`WRONG redirect ${slug(r.from, r.to)} -> ${d}`); }
}
for (const s of legacy) if (original.has(s)) console.log(`note: ${s} already existed, legacy entry ignored`);
console.log(`\nword-to-pdf -> ${legacyDestination('word-to-pdf')}, pdf-to-word -> ${legacyDestination('pdf-to-word')}`);
console.log(bad ? `\n${bad} PROBLEM(S)` : '\nOK: every (b) pair has a page and redirects to it');
process.exit(bad ? 1 : 0);
