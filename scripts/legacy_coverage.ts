// Where do the old indexed converter URLs land now?  tsx scripts/legacy_coverage.ts <old_pages.json>
// old_pages.json = [{url, clicks, impr}] exported from Search Console.
import { readFileSync } from 'node:fs';
import { legacyDestination, LEGACY_PAIR_RE } from '@/lib/convert/legacy';

const rows: { url: string; clicks: number; impr: number }[] = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const kind = { pair: 0, tool: 0, hub: 0 };
const impr = { pair: 0, tool: 0, hub: 0 };
const hubFrom = new Map<string, number>();
for (const r of rows) {
  const slug = new URL(r.url).pathname.slice(1);
  if (!LEGACY_PAIR_RE.test(slug)) continue;
  const d = legacyDestination(slug);
  const k = d.startsWith('/convert/') ? 'pair' : d.startsWith('/tools/') ? 'tool' : 'hub';
  kind[k]++; impr[k] += r.impr;
  if (k === 'hub') { const f = slug.split('-to-')[0]; hubFrom.set(f, (hubFrom.get(f) ?? 0) + r.impr); }
}
console.log('urls', kind, 'impressions', impr);
console.log('top unmapped FROM formats (by impressions):',
  [...hubFrom].sort((a, b) => b[1] - a[1]).slice(0, 40).map(([f, n]) => `${f}:${n}`).join(' '));
for (const s of ['cfg-to-txt', 'ani-to-cur', 'dwg-to-txt', 'obj-to-ifc', 'cbr-to-jpg', 'mp4-to-mp3', 'png-to-jpg', 'eml-to-xml', 'fbx-to-dwg'])
  console.log(s, '->', legacyDestination(s));
