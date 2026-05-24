/**
 * Xonvert AI — live web-gather test (Node, no model).
 *
 * Proves the research/gather step actually works server-side (Node fetch has no
 * CORS wall, and r.jina.ai returns clean page text). Independent of the heavy
 * model, so it runs fast and reliably.
 *
 * Run:  npx tsx lib/ai/eval/gather-probe.ts "why do cats purr"
 */

import { facetQueries, gatherForQueries, researchSources } from '../research';

async function main() {
  const q = process.argv.slice(2).join(' ') || 'why do cats purr';
  console.log(`\nGather for: "${q}"`);
  const queries = facetQueries(q);
  console.log(`Planned queries: ${JSON.stringify(queries)}\n`);
  const t0 = Date.now();
  const ev = await gatherForQueries(queries);
  console.log(`Gathered ${ev.length} passages in ${((Date.now() - t0) / 1000).toFixed(1)}s:\n`);
  ev.forEach((e, i) => {
    console.log(`  [${i + 1}] ${e.source.site} — ${e.source.url}`);
    console.log(`      ${e.text.slice(0, 180).replace(/\s+/g, ' ')}…\n`);
  });
  console.log(`Sources for citation: ${researchSources(ev).map((s) => s.site).join(', ') || '(none)'}`);
  console.log(ev.length ? '\n✓ Web gather works in Node.\n' : '\n✗ No passages — network or reader issue.\n');
  process.exit(ev.length ? 0 : 1);
}
main().catch((e) => { console.error('gather error:', e?.message ?? e); process.exit(1); });
