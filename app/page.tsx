import Link from 'next/link';
import { TileGrid } from '@/components/tiles/TileGrid';
import { ToolTile } from '@/components/tiles/ToolTile';
import { HomeAiHero } from '@/components/home/HomeAiHero';
import { Tile } from '@/components/tiles/Tile';
import { TileIcon } from '@/components/tiles/TileIcon';
import { CategoryGrid } from '@/components/home/CategoryGrid';
import { TOOLS } from '@/lib/registry';
import { IS_OIOXO } from '@/lib/brand';
import ConvertAnythingTool from '@/tools/convert-anything/ui';

export default function HomePage() {
  return (
    <div className="space-y-12">
      {/* Hero — the brand AI as the centrepiece. Clean centered wordmark, no icon. */}
      <section className="flex flex-col gap-4">
        <div className="text-center">
          <h1 className="text-[32px] font-extrabold leading-[1.05] tracking-tight text-[var(--color-fg)] sm:text-[44px]">
            {IS_OIOXO ? (
              <span
                style={{
                  background: 'var(--brand-gradient)',
                  WebkitBackgroundClip: 'text',
                  backgroundClip: 'text',
                  color: 'transparent',
                }}
              >
                oioxo
              </span>
            ) : (
              <>
                Every File. Every Tool. One Tap.
              </>
            )}
          </h1>
          <p className="mx-auto mt-2 text-[14px] font-medium text-balance text-[var(--color-fg-muted)] sm:whitespace-nowrap sm:text-[16px]">
            {IS_OIOXO
              ? 'One AI for everything — understands, searches, and gets it done, privately on your device.'
              : '260+ formats • 400+ tools • Free, fast & private'}
          </p>
        </div>
        {IS_OIOXO ? <HomeAiHero /> : <div className="mt-8 mx-auto w-full max-w-3xl"><ConvertAnythingTool /></div>}
      </section>

      {/* oioxo flagship: the build-a-project surface (function-only copy) */}
      {IS_OIOXO && (
        <section>
          <Tile size="L" color="oklch(20% 0.008 250)" href="/oioxo?tab=code">
            <div className="flex items-start justify-between">
              <TileIcon name="code-2" size={26} className="text-white/95" />
              <span className="rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white/80">
                New
              </span>
            </div>
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/70">
                Build
              </div>
              <div className="mt-1 text-[22px] font-extrabold leading-tight tracking-tight text-white">
                Describe an app — it builds, runs &amp; previews it
              </div>
              <div className="mt-1.5 max-w-2xl text-[13px] font-medium text-white/60">
                Plans the steps, writes the files, checks its own work, and shows a live preview —
                web, React, Node, Python or SQL. On your device. Open a folder or a GitHub repo, or
                share a live project with someone. <span className="text-white/80">Start building →</span>
              </div>
            </div>
          </Tile>
        </section>
      )}

      {/* Quick tiles — pinned tools + convert hub */}
      <section>
        <TileGrid cols={4}>
          {TOOLS.filter((t) => t.pinDefault).slice(0, 4).map((t, i) => (
            <ToolTile key={t.id} tool={t} flipDelay={`${i * 2.5}s`} />
          ))}

          {/* Convert hub teaser */}
          <Tile
            size="M"
            colorVar="--color-cat-convert"
            href="/convert"
            transitionName="cat-convert"
          >
            <div className="flex items-start justify-between">
              <TileIcon name="replace" size={26} className="text-white/95" />
              <span className="rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-white">
                Hub
              </span>
            </div>
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/75">
                Convert
              </div>
              <div className="mt-1 font-mono text-[20px] font-semibold leading-tight tracking-tight text-white">
                PNG → JPG · MP4 → MP3
              </div>
              <div className="mt-1 text-[12px] font-medium text-white/65">
                260+ formats, every direction
              </div>
            </div>
          </Tile>
        </TileGrid>
      </section>

      {/* Categories band — uniform aligned grid */}
      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--color-fg-muted)]">
            Browse by category
          </h2>
          <Link href="/tools" className="text-[12px] text-[var(--color-fg-muted)] transition hover:text-[var(--color-fg)]">
            All tools →
          </Link>
        </div>
        <CategoryGrid />
      </section>

      {/* All migrated tools — Phase 1 batch */}
      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--color-fg-muted)]">
            Available now
          </h2>
          <span className="text-[12px] text-[var(--color-fg-subtle)]">{TOOLS.length} live · more coming</span>
        </div>
        <TileGrid cols={4}>
          {TOOLS.filter((t) => !t.pinDefault).map((t, i) => (
            <ToolTile key={t.id} tool={t} flipDelay={`${i * 1.2}s`} />
          ))}
        </TileGrid>
      </section>

      {/* Promise band */}
      <section>
        <TileGrid cols={4}>
          <Tile size="M" color="oklch(20% 0.008 250)">
            <TileIcon name="shield-check" size={22} className="text-white/85" />
            <div>
              <div className="text-[14px] font-semibold tracking-tight text-white">
                Files stay yours
              </div>
              <div className="mt-1 text-[12px] text-white/55">
                No signup. No tracking. Your files stay private. Pro Quality is the only opt-in exception.
              </div>
            </div>
          </Tile>

          <Tile size="M" color="oklch(20% 0.008 250)">
            <TileIcon name="zap" size={22} className="text-[var(--color-cat-audio)]" />
            <div>
              <div className="text-[14px] font-semibold tracking-tight text-white">
                Studio-grade output
              </div>
              <div className="mt-1 text-[12px] text-white/55">
                Hand-tuned for every format. Photo, audio, video, document — same standard.
              </div>
            </div>
          </Tile>

          <Tile size="M" color="oklch(20% 0.008 250)">
            <TileIcon name="wifi-off" size={22} className="text-[var(--color-cat-dev)]" />
            <div>
              <div className="text-[14px] font-semibold tracking-tight text-white">
                Works offline
              </div>
              <div className="mt-1 text-[12px] text-white/55">
                Install once. Use anywhere — no connection required for most tools.
              </div>
            </div>
          </Tile>

          <Tile size="M" color="oklch(20% 0.008 250)">
            <TileIcon name="sparkles" size={22} className="text-[var(--color-cat-convert)]" />
            <div>
              <div className="text-[14px] font-semibold tracking-tight text-white">
                Pro Quality, on demand
              </div>
              <div className="mt-1 text-[12px] text-white/55">
                Tap into a shared GPU for the heaviest jobs — opt-in, transparent, optional.
              </div>
            </div>
          </Tile>
        </TileGrid>
      </section>
    </div>
  );
}
