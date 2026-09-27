import type { Metadata } from 'next';
import Link from 'next/link';
import { SectionTitle } from '@/components/layout/SectionTitle';
import { buildMeta } from '@/lib/seo/meta';
import { CONVERT_PAIRS, popularPairs, pairsByCategory } from '@/lib/convert/pairs';
import { TileIcon } from '@/components/tiles/TileIcon';
import ConvertAnythingTool from '@/tools/convert-anything/ui';

export const metadata: Metadata = buildMeta({
  path: '/convert',
  title: 'Convert anything',
  description: `Convert files across ${CONVERT_PAIRS.length}+ format pairs — images, audio, video. Files stay yours.`,
});

function PairTile({ from, to, popular = false }: { from: string; to: string; popular?: boolean }) {
  return (
    <Link prefetch={false}
      href={`/convert/${from}-to-${to}`}
      className="group relative flex items-center justify-between border border-black/[0.08] bg-[var(--color-surface-1)] px-4 py-3 transition hover:border-[var(--color-cat-convert)] hover:bg-[var(--color-cat-convert)] hover:text-white"
    >
      <div className="flex items-baseline gap-1.5 font-mono text-[14px] font-semibold tracking-tight">
        <span>{from.toUpperCase()}</span>
        <span className="text-[var(--color-fg-subtle)] group-hover:text-white/70">→</span>
        <span>{to.toUpperCase()}</span>
      </div>
      {popular && (
        <span className="ml-2 bg-black/[0.06] px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-[var(--color-fg-muted)] group-hover:bg-white/20 group-hover:text-white">
          Popular
        </span>
      )}
    </Link>
  );
}

export default function ConvertHub() {
  const imagePairs = pairsByCategory('image');
  const audioPairs = pairsByCategory('audio');
  const videoPairs = pairsByCategory('video');
  const popular = popularPairs(8);

  return (
    <div className="space-y-12">
      <section className="space-y-3">
        <SectionTitle label="Convert anything" colorVar="--color-cat-convert" />
        <h1 className="max-w-3xl text-[44px] font-semibold leading-[1.04] tracking-tight text-[var(--color-fg)] text-balance">
          Drop a file. We&apos;ll figure out the rest.
        </h1>
        <p className="max-w-xl text-[15px] text-[var(--color-fg-muted)] text-pretty">
          {CONVERT_PAIRS.length}+ conversions across images, audio, and video — plus every editing tool. Files stay yours.
        </p>
      </section>

      <ConvertAnythingTool />

      <section className="space-y-3">
        <SectionTitle label="Most popular" colorVar="--color-cat-convert" />
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-4">
          {popular.map((p) => (
            <PairTile key={`pop-${p.from}-${p.to}`} from={p.from} to={p.to} popular />
          ))}
        </div>
      </section>

      {[
        { label: 'Image', icon: 'image', pairs: imagePairs },
        { label: 'Audio', icon: 'music', pairs: audioPairs },
        { label: 'Video', icon: 'film',  pairs: videoPairs },
      ].map(({ label, icon, pairs }) => pairs.length > 0 && (
        <section key={label} className="space-y-3">
          <div className="flex items-center gap-3">
            <TileIcon name={icon} size={20} strokeWidth={1.75} className="text-[var(--color-cat-convert)]" />
            <SectionTitle label={`${label} formats`} colorVar="--color-cat-convert" />
            <span className="font-mono text-[11px] tabular-nums text-[var(--color-fg-muted)]">{pairs.length}</span>
          </div>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {pairs.map((p) => (
              <PairTile key={`${label}-${p.from}-${p.to}`} from={p.from} to={p.to} popular={p.popular} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
