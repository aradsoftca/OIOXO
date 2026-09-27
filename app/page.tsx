import type { Metadata } from 'next';
import Link from 'next/link';
import { TileGrid } from '@/components/tiles/TileGrid';
import { ToolTile } from '@/components/tiles/ToolTile';
import { HomeAiHero } from '@/components/home/HomeAiHero';
import { Tile } from '@/components/tiles/Tile';
import { TileIcon } from '@/components/tiles/TileIcon';
import { CategoryGrid } from '@/components/home/CategoryGrid';
import { TOOLS, CATEGORIES } from '@/lib/registry';
import { BRAND, BRAND_DOMAIN, IS_OIOXO } from '@/lib/brand';
import ConvertAnythingTool from '@/tools/convert-anything/ui';
import { buildMeta } from '@/lib/seo/meta';
import { faqPageJsonLd, structuredDataToScript } from '@/lib/seo/jsonld';

const POPULAR_IDS = [
  'pdf-compress', 'pdf-merge', 'pdf-split', 'pdf-to-images', 'images-to-pdf', 'pdf-rotate',
  'image-compress', 'image-resize', 'image-convert-format', 'image-remove-bg', 'image-crop', 'image-heic-convert',
  'video-compress', 'video-extract-audio', 'video-to-gif', 'video-trim', 'video-convert-format', 'video-resize',
  'audio-convert-format', 'audio-trim', 'audio-volume', 'model-3d-convert', 'cad-convert', 'font-convert',
];
const POPULAR = POPULAR_IDS.map((id) => TOOLS.find((t) => t.id === id)).filter((t): t is (typeof TOOLS)[number] => !!t && !t.pinDefault);

export const metadata: Metadata = buildMeta({
  path: '/',
  title: IS_OIOXO
    ? `${BRAND} — on-device AI for editing, converting, coding, chat`
    : `${BRAND} — 400+ browser tools for files, photos, audio, video, PDF`,
  description: IS_OIOXO
    ? `${BRAND} is an on-device AI platform: ask it to edit photos, cut video, master audio, OCR PDFs, transcribe speech, build apps — and it does it on your device, privately, in your browser.`
    : `${BRAND} ships 400+ free tools for image, audio, video, PDF, text, dev, calc and more. Convert 260+ formats. Files never leave your device.`,
  keywords: IS_OIOXO
    ? ['on-device ai', 'private ai', 'browser ai', 'webgpu ai', 'ai photo editor', 'ai video editor', 'ai voice studio', 'ai pdf', 'chatgpt alternative', 'free ai assistant']
    : ['free online tools', 'file converter', 'photo editor browser', 'pdf tools', 'video editor online', 'audio converter', 'free pdf editor', 'no upload tools', 'no signup tools', 'browser productivity'],
});

const HOME_FAQS_XONVERT = [
  { q: `Is ${BRAND} really free?`, a: `Yes — every tool is free to use without a credit card or signup. Pro unlocks higher daily quotas, removes the small export watermark, and lifts limits on heavy operations.` },
  { q: 'Do my files get uploaded?', a: `No. ${BRAND} runs entirely in your browser. Your files are processed locally and never reach our servers. You can verify this in your browser's network panel.` },
  { q: `What can ${BRAND} actually do?`, a: `Images: compress, resize, convert, crop, remove backgrounds. PDF: compress, merge, split, rotate, convert to and from images. Video: compress, trim, resize, convert, extract audio as MP3. Audio: convert, trim, change volume. CAD & 3D: DWG to DXF, STEP/IGES to STL or OBJ, and 3D models to GLB/glTF. Plus hundreds of text, developer and calculator tools.` },
  { q: 'Which formats are supported?', a: `Common image, audio, video and PDF formats, plus CAD and 3D formats (DWG, DXF, STEP, IGES, STL, OBJ, FBX, GLB and more), fonts and subtitles. The Convert hub and the CAD & 3D page list every supported conversion.` },
  { q: 'Does it work offline?', a: 'Yes — once a tool page is loaded, the browser caches the assets and the tool keeps working without internet.' },
  { q: 'Does it work on mobile?', a: 'Yes. Every tool works in modern mobile browsers on Android and iOS without an app install.' },
];

const HOME_FAQS_OIOXO = [
  { q: `What is ${BRAND}?`, a: `${BRAND} is an on-device AI platform. A small "conductor" model runs in your browser and orchestrates 300+ specialist tools — photo, video, audio, PDF, code, search — to actually do what you ask, not just describe it.` },
  { q: 'Where does the AI run?', a: `On your device. The conductor runs in your browser via WebGPU (with a WASM fallback). Specialist models for transcription, OCR, segmentation, and translation also run on-device. Cloud AI providers are not in the loop.` },
  { q: `How is ${BRAND} different from ChatGPT?`, a: `ChatGPT generates a response describing what to do. ${BRAND} actually does it — it routes your intent to deterministic tools that produce real output files. The model doesn't generate your photo or video; it orchestrates the editing tool that does.` },
  { q: 'Is it free?', a: 'Yes. The conductor and the on-device specialist models are free. Pro lifts quotas, unlocks higher-quality models, and enables select cloud-GPU offload when you explicitly opt in.' },
  { q: 'What hardware do I need?', a: 'WebGPU is preferred — any 2022+ desktop GPU, recent Apple Silicon, or many recent Android devices. Older hardware falls back to a slower WASM path that still works.' },
  { q: 'Does anything I do leave my device?', a: `No, by design. Files, prompts, and the AI's plan all stay local. Web search and lookups go through ${BRAND}'s own server (proof-of-work gated) so third-party APIs never see your queries.` },
];

const HOME_FAQS = IS_OIOXO ? HOME_FAQS_OIOXO : HOME_FAQS_XONVERT;

function buildHomeItemList() {
  const base = `https://${BRAND_DOMAIN}`;
  const items = Object.values(CATEGORIES).slice(0, 12).map((c, i) => ({
    '@type': 'ListItem',
    position: i + 1,
    name: c.name,
    url: `${base}/tools/c/${c.id}`,
    description: c.blurb,
  }));
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    itemListElement: items,
  };
}

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
              <span className="rounded-full bg-white/15 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-white/80">
                New
              </span>
            </div>
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/70">
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

      {/* The niche xonvert leads with: private CAD & 3D conversion */}
      {!IS_OIOXO && (
        <section className="border border-black/[0.08] bg-[var(--color-surface-1)] p-5">
          <h2 className="text-[22px] font-bold tracking-tight text-[var(--color-fg)]">
            <Link href="/cad-3d" className="hover:underline">CAD &amp; 3D files — converted privately in your browser</Link>
          </h2>
          <p className="mt-1 max-w-3xl text-[14px] text-[var(--color-fg-muted)]">
            Open AutoCAD drawings without AutoCAD, mesh STEP and IGES solids for 3D printing, and turn FBX, OBJ or STL
            models into web-ready GLB. Your designs never leave your device.
          </p>
          <div className="mt-3 flex flex-wrap gap-2 font-mono text-[13px] font-semibold">
            {['dwg-to-dxf', 'step-to-stl', 'stp-to-stl', 'step-to-obj', 'iges-to-stl', 'fbx-to-glb', 'obj-to-glb', 'stl-to-glb'].map((s) => (
              <Link prefetch={false} key={s} href={`/convert/${s}`} className="border border-black/[0.08] px-2.5 py-1.5 hover:bg-[var(--color-surface-2)]">
                {s.replace('-to-', ' → ').toUpperCase()}
              </Link>
            ))}
            <Link href="/cad-3d" className="px-2.5 py-1.5 underline underline-offset-2">All CAD &amp; 3D →</Link>
          </div>
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
              <span className="rounded-full bg-white/15 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wider text-white">
                Hub
              </span>
            </div>
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/75">
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

      {/* Popular tools. Not all 340+: rendering every tile (each with an inline
          SVG icon) made the homepage 761 KB of HTML at 3.5% text. /tools lists all. */}
      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--color-fg-muted)]">
            Popular tools
          </h2>
          <Link href="/tools" className="text-[12px] text-[var(--color-fg-muted)] transition hover:text-[var(--color-fg)]">
            All {TOOLS.length} tools →
          </Link>
        </div>
        <TileGrid cols={4}>
          {POPULAR.map((t, i) => (
            <ToolTile key={t.id} tool={t} flipDelay={`${i * 1.2}s`} />
          ))}
        </TileGrid>
      </section>

      {/* SEO content block: FAQ + structured data */}
      <section className="space-y-3 border-t border-black/[0.08] pt-8 text-[14px] leading-relaxed text-[var(--color-fg)]">
        <h2 className="text-[20px] font-bold tracking-tight">Frequently asked questions</h2>
        <div className="space-y-2">
          {HOME_FAQS.map((f, i) => (
            <details key={i} className="group border border-black/[0.06] bg-[var(--color-surface-1)] p-4">
              <summary className="flex cursor-pointer items-start justify-between gap-3 text-[14px] font-semibold">
                <span>{f.q}</span>
                <span className="shrink-0 text-[var(--color-fg-muted)] transition-transform group-open:rotate-45">+</span>
              </summary>
              <div className="mt-2 text-[13px] text-[var(--color-fg-muted)]">{f.a}</div>
            </details>
          ))}
        </div>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: structuredDataToScript(faqPageJsonLd(HOME_FAQS)) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: structuredDataToScript(buildHomeItemList()) }}
        />
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
