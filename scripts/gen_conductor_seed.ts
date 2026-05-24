/**
 * oioxo Code P6 — build the conductor's SEED training set, with every example
 * validated by the same type oracle that labels real loop trajectories (a buggy
 * case must error; its fix must be clean). Plus PLAN examples. Real red→green
 * trajectories (recorded in the app) append to this over time and dominate later.
 *
 *   npx tsx scripts/gen_conductor_seed.ts            # -> scripts/conductor-seed.jsonl
 *   npx tsx scripts/gen_conductor_seed.ts --check    # validate only, write nothing
 *
 * In Node the type oracle reads default libs from ts.sys, so no CDN map is needed.
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildSeed, planExamples, toJsonl } from '../lib/oioxo/conductor';

(async () => {
  const checkOnly = process.argv.includes('--check');
  const seed = await buildSeed();
  const plans = planExamples();
  const all = [...seed.examples, ...plans];

  const byRole = all.reduce<Record<string, number>>((m, e) => ((m[e.role] = (m[e.role] ?? 0) + 1), m), {});
  console.log(`seed examples: ${all.length}`, byRole);
  if (seed.rejected.length) {
    console.log('REJECTED (oracle disagreed):');
    for (const r of seed.rejected) console.log(`  ${r.path}: ${r.reason}`);
    process.exitCode = 1; // a rejected seed means a bad case — fail loudly
  }

  if (!checkOnly) {
    const out = join(process.cwd(), 'scripts', 'conductor-seed.jsonl');
    writeFileSync(out, toJsonl(all), 'utf8');
    console.log(`wrote ${all.length} examples -> ${out}`);
    console.log('SAMPLE (fix):\n', all[0].messages[1].content.slice(0, 200));
  }
})().catch((e) => { console.error('ERROR', e); process.exit(1); });
