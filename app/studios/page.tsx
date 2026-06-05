import * as React from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { TileIcon } from '@/components/tiles/TileIcon';
import { SectionTitle } from '@/components/layout/SectionTitle';
import { BRAND, BRAND_DOMAIN, IS_OIOXO } from '@/lib/brand';
import { studiosOnly } from '@/lib/apps';
import { StudiosTourMount } from './tour-mount';
import { buildMeta } from '@/lib/seo/meta';
import { faqPageJsonLd, structuredDataToScript } from '@/lib/seo/jsonld';

export const metadata: Metadata = buildMeta({
  path: '/studios',
  title: IS_OIOXO
    ? `${BRAND} Studios — AI-driven creative editors in your browser`
    : `${BRAND} Studios — pro creative editors in your browser`,
  description: IS_OIOXO
    ? `Nine pro creative studios on oioxo, each callable by the on-device AI. Edit photos, video, audio, PDFs, sheets, docs and slides by chatting — or drive every control yourself. Nothing uploaded.`
    : `Pro photo editor, multi-track video NLE, PDF editor, spreadsheets, documents, slides — every studio runs on your device. Nothing uploaded, no install, no account.`,
  keywords: IS_OIOXO
    ? [
        'ai photo editor',
        'ai video editor on device',
        'ai pdf editor',
        'ai spreadsheet assistant',
        'ai slides generator',
        'on-device ai studio',
        'webgpu creative ai',
        'private ai editor',
        'free ai photoshop alternative',
        'chatgpt for editing',
      ]
    : [
        'browser photo editor',
        'online video editor',
        'pro pdf editor',
        'online spreadsheet editor',
        'online slides editor',
        'free creative studio',
        'private editor',
        'no upload editor',
        'web-based DAW',
        'browser audio studio',
      ],
});

const STUDIO_FAQS_XONVERT = [
  { q: 'Are the Studios really free?', a: 'Yes — every Studio is free to use without a credit card, signup, or trial limits. Pro removes the watermark on exports and unlocks higher quotas.' },
  { q: 'Does anything I edit get uploaded?', a: 'No. All Studios run entirely in your browser. Your photos, videos, audio, PDFs, sheets, docs and slides never leave your device.' },
  { q: 'Can I work offline?', a: 'Yes — once the page is loaded, the Studios work fully offline. The browser caches the assets after first visit so you can keep editing without an internet connection.' },
  { q: 'How do they compare to desktop software like Photoshop or DaVinci?', a: 'Each Studio implements the core feature set of its desktop counterpart — layers, blend modes, color grading, multi-track timelines, keyframes — and runs comparably fast for typical creator workloads. Heavy professional film projects still benefit from native software, but for the vast majority of content the Studios are a complete replacement.' },
  { q: 'Can I collaborate with someone live?', a: 'Yes — Docs and Slides support real-time peer-to-peer collaboration over WebRTC. End-to-end encrypted, with no server in the middle.' },
];

const STUDIO_FAQS_OIOXO = [
  { q: 'How does the oioxo AI interact with the Studios?', a: 'Each Studio exposes its core operations as callable skills the on-device conductor model can invoke. Ask the assistant for "remove the background and crop tight to my face" and it opens Image Studio, runs the right steps, and shows you the layers. You can take over the controls at any point — the AI is an interface, not a black box.' },
  { q: 'Does the AI run in the cloud?', a: 'No. The conductor model that picks tools and fills parameters runs on your device via WebGPU (or WASM as a fallback). The specialist models for OCR, transcription, and segmentation are also on-device. No cloud-AI provider sees your prompt or your file.' },
  { q: 'Can the AI generate a video / image / song from scratch?', a: 'The AI is a conductor, not a generator. It chains existing studio tools to produce real, deterministic output (cuts, effects, color grades, transcriptions, layouts). For from-scratch generation we route to opt-in specialist models with explicit consent — never silently.' },
  { q: 'Is it free?', a: 'Yes. The Studios and the conductor are free, including the AI features that run on-device. Pro lifts watermarks and quotas, and unlocks higher-quality specialist models for the heaviest jobs.' },
  { q: 'What hardware do I need for the AI features?', a: 'WebGPU is preferred — any 2022+ desktop GPU, recent Apple Silicon, or many recent Android devices. Older hardware falls back to a slower WASM path that still works. The Studios themselves run on any modern browser regardless of the AI features.' },
];

const STUDIO_FAQS = IS_OIOXO ? STUDIO_FAQS_OIOXO : STUDIO_FAQS_XONVERT;

interface ProStudioCard {
  href: string;
  name: string;
  short: string;
  icon: string;
  colorVar: string;
  tagline: string;
  features: string[];
  rivals: string;
}

const PRO_STUDIOS: ProStudioCard[] = [
  {
    href: '/tools/image-studio',
    name: 'Image Studio',
    short: 'Photo',
    icon: 'brush',
    colorVar: '--color-cat-image',
    tagline: 'Photoshop-class layered editor',
    features: ['16 blend modes + masks', 'Layer styles (shadow / glow / stroke)', '14 color grades + curves', 'AI bg-remove, smart-crop, palette', 'Layer animations + export'],
    rivals: 'vs Photoshop · Photopea · Canva',
  },
  {
    href: '/tools/video-studio',
    name: 'Video Studio',
    short: 'Video',
    icon: 'clapperboard',
    colorVar: '--color-cat-video',
    tagline: 'Multi-track NLE with pro color',
    features: ['V1/V2/text/A1/A2 tracks', 'Color wheels + RGB curves + 3 scopes', '28 templates, 14 LUTs, 13 transitions', 'Per-clip color keyframes', 'WebCodecs preview, ffmpeg.wasm export'],
    rivals: 'vs DaVinci Resolve · CapCut · Clipchamp',
  },
  {
    href: '/tools/audio-voice-studio',
    name: 'Voice Studio',
    short: 'Voice',
    icon: 'mic-vocal',
    colorVar: '--color-cat-audio',
    tagline: 'Multi-clip voice DAW',
    features: ['Mic record + TTS-as-clip + import', 'Effect chain rack (17 effects)', 'LUFS + true-peak meter', 'Smart silence remove / broadcast preset', 'Spectrogram view'],
    rivals: 'vs Audacity · Adobe Audition',
  },
  {
    href: '/tools/audio-music-studio',
    name: 'Music Studio',
    short: 'Music',
    icon: 'music',
    colorVar: '--color-cat-audio',
    tagline: 'Step sequencer + synth',
    features: ['16-step grid, 8 instruments', 'Genre templates + chord-fill + humanize', 'Master effects rack', 'Audio→MIDI pitch detection (YIN)', 'Pattern chains + swing'],
    rivals: 'vs FL Studio · Ableton (light)',
  },
  {
    href: '/tools/subtitle-studio',
    name: 'Subtitle Studio',
    short: 'Subtitles',
    icon: 'captions',
    colorVar: '--color-cat-subtitle',
    tagline: 'Aegisub-class cue editor',
    features: ['Waveform-synced cue timeline', 'On-device Whisper auto-transcribe', 'Speaker diarization (auto [A]/[B])', '20 style presets · frame-jog', 'SRT / VTT / ASS export'],
    rivals: 'vs Aegisub · Premiere Captions',
  },
  {
    href: '/tools/pdf-studio',
    name: 'PDF Studio',
    short: 'PDF',
    icon: 'file-pen',
    colorVar: '--color-cat-pdf',
    tagline: 'Acrobat-class editor + AI',
    features: ['Annotate / redact / sign / draw', 'OCR (20 languages) → searchable PDF', 'Smart Redact (auto PII detection)', 'Watermark · Split · Merge', 'Export to Word'],
    rivals: 'vs Acrobat · Foxit · PDFelement',
  },
  {
    href: '/tools/office-studio',
    name: 'Sheets Studio',
    short: 'Sheets',
    icon: 'table-2',
    colorVar: '--color-cat-convert',
    tagline: 'Excel-class spreadsheet',
    features: ['140 formulas (VLOOKUP/INDEX/MATCH/FILTER)', 'Pivot tables + 6 chart types', 'Sparklines · named ranges · validation', 'Conditional formatting + freeze panes', 'XLSX round-trip, 50 locales'],
    rivals: 'vs Excel · Google Sheets',
  },
  {
    href: '/tools/office-docs',
    name: 'Docs Studio',
    short: 'Docs',
    icon: 'file-text',
    colorVar: '--color-cat-text',
    tagline: 'Word-class with AI extras',
    features: ['Real-time P2P collaboration', 'Track Changes + Comments', 'KaTeX equations + TOC', 'Read aloud + voice typing', 'DOCX round-trip, 50 locales'],
    rivals: 'vs Word · Google Docs',
  },
  {
    href: '/tools/office-slides',
    name: 'Slides Studio',
    short: 'Slides',
    icon: 'presentation',
    colorVar: '--color-cat-generator',
    tagline: 'PowerPoint-class with animations',
    features: ['24 element animations (entrance/emphasis/exit)', 'SmartArt from bullets (6 layouts)', 'Sections · themes · present mode', 'Comments per element', 'PPTX / PDF / PNG export'],
    rivals: 'vs PowerPoint · Keynote · Beautiful.ai',
  },
];

const PILLARS = [
  { icon: '🔒', title: 'All on your device', body: 'Nothing uploads. No server reads your files. Works fully offline once loaded.' },
  { icon: '⚡', title: 'No install, no account', body: 'Open a URL and edit. Free forever for personal use.' },
  { icon: '🧠', title: 'AI runs locally', body: 'Background remove, OCR, transcription, pitch detection — all on-device, never billed.' },
  { icon: '📁', title: 'Open file formats', body: 'XLSX, DOCX, PPTX, PDF — round-trip the formats your team already uses.' },
  { icon: '🤝', title: 'P2P collaboration', body: 'Live editing across browsers via WebRTC. End-to-end encrypted. Zero server compute.' },
  { icon: '⌨️', title: '150 shortcuts documented', body: 'Press ? in any studio to see every keyboard shortcut grouped by purpose.' },
];

export default function StudiosPage() {
  const allStudios = studiosOnly(IS_OIOXO);
  const proHrefs = new Set(PRO_STUDIOS.map(s => s.href));
  const otherStudios = allStudios.filter(a => !proHrefs.has(a.href));

  return (
    <div className="space-y-12">
      <StudiosTourMount />
      <header className="space-y-3">
        <SectionTitle label="Studios" colorVar="--color-cat-video" />
        <h1 className="text-[40px] font-bold tracking-tight text-[var(--color-fg)] sm:text-[52px]">Pro creative studios.<br className="hidden sm:block" /> No install, all yours.</h1>
        <p className="max-w-3xl text-[14px] leading-relaxed text-[var(--color-fg-muted)] sm:text-[16px]">
          Nine pro editors that go head-to-head with Photoshop, DaVinci, Excel, Word, PowerPoint, Acrobat — every one runs{' '}
          <strong className="text-[var(--color-fg)]">entirely on your device</strong>, with on-device AI, P2P collaboration, and zero subscription.
        </p>
      </header>

      <section>
        <div className="mb-4 flex items-end justify-between gap-4">
          <h2 className="text-[22px] font-bold tracking-tight text-[var(--color-fg)]">The 9 Pro Studios</h2>
          <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-[var(--color-fg-subtle)]">Tap to open</span>
        </div>
        <div className="grid grid-cols-1 gap-[2px] sm:grid-cols-2 lg:grid-cols-3">
          {PRO_STUDIOS.map(s => (
            <Link
              key={s.href}
              href={s.href}
              className="group flex flex-col gap-4 bg-[var(--color-surface-1)] p-5 transition hover:bg-[var(--color-surface-2)]"
            >
              <div className="flex items-start justify-between gap-3">
                <span className="grid h-12 w-12 shrink-0 place-items-center text-white shadow-sm" style={{ background: `var(${s.colorVar})` }}>
                  <TileIcon name={s.icon} size={22} strokeWidth={1.75} />
                </span>
                <span className="text-[9px] font-bold uppercase tracking-[0.18em] text-[var(--color-fg-subtle)] text-right">{s.rivals}</span>
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-1.5 text-[17px] font-bold tracking-tight text-[var(--color-fg)]">
                  {s.name}
                  <span className="text-[var(--color-fg-subtle)] transition group-hover:translate-x-1">→</span>
                </div>
                <p className="mt-1 text-[12px] font-medium text-[var(--color-fg-muted)]" style={{ color: `var(${s.colorVar})` }}>{s.tagline}</p>
                <ul className="mt-3 space-y-1">
                  {s.features.map((f, i) => (
                    <li key={i} className="flex items-start gap-2 text-[12px] leading-snug text-[var(--color-fg-muted)]">
                      <span className="mt-0.5 text-[var(--color-fg-subtle)]">·</span>
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-[22px] font-bold tracking-tight text-[var(--color-fg)]">Built different</h2>
        <div className="grid grid-cols-1 gap-[2px] sm:grid-cols-2 lg:grid-cols-3">
          {PILLARS.map(p => (
            <div key={p.title} className="bg-[var(--color-surface-1)] p-5">
              <div className="text-[24px] leading-none">{p.icon}</div>
              <h3 className="mt-3 text-[15px] font-bold tracking-tight text-[var(--color-fg)]">{p.title}</h3>
              <p className="mt-1 text-[13px] leading-relaxed text-[var(--color-fg-muted)]">{p.body}</p>
            </div>
          ))}
        </div>
      </section>

      {otherStudios.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-[22px] font-bold tracking-tight text-[var(--color-fg)]">More creative tools</h2>
          <div className="grid grid-cols-1 gap-[2px] sm:grid-cols-2 lg:grid-cols-3">
            {otherStudios.map((a) => (
              <Link key={a.href} href={a.href}
                className="group flex flex-col gap-3 bg-[var(--color-surface-1)] p-5 transition hover:bg-[var(--color-surface-2)]">
                <div className="flex items-center justify-between">
                  <span className="grid h-11 w-11 place-items-center text-white" style={{ background: `var(${a.colorVar})` }}>
                    <TileIcon name={a.icon} size={22} strokeWidth={1.75} />
                  </span>
                  <span className="text-[9px] font-bold uppercase tracking-[0.18em] text-[var(--color-fg-subtle)]">{a.tag}</span>
                </div>
                <div>
                  <div className="flex items-center gap-1.5 text-[16px] font-bold tracking-tight text-[var(--color-fg)]">
                    {a.name}
                    <span className="text-[var(--color-fg-subtle)] transition group-hover:translate-x-0.5">→</span>
                  </div>
                  <p className="mt-1 text-[13px] leading-relaxed text-[var(--color-fg-muted)]">{a.blurb}</p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="space-y-3 pt-6">
        <h2 className="text-[20px] font-bold tracking-tight text-[var(--color-fg)]">Studios FAQ</h2>
        <div className="space-y-2">
          {STUDIO_FAQS.map((f, i) => (
            <details key={i} className="group border border-black/[0.06] bg-[var(--color-surface-1)] p-4">
              <summary className="flex cursor-pointer items-start justify-between gap-3 text-[14px] font-semibold">
                <span>{f.q}</span>
                <span className="shrink-0 text-[var(--color-fg-muted)] transition-transform group-open:rotate-45">+</span>
              </summary>
              <div className="mt-2 text-[13px] text-[var(--color-fg-muted)]">{f.a}</div>
            </details>
          ))}
        </div>
      </section>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: structuredDataToScript(faqPageJsonLd(STUDIO_FAQS)) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: structuredDataToScript({
            '@context': 'https://schema.org',
            '@type': 'ItemList',
            name: `${BRAND} Pro Studios`,
            numberOfItems: PRO_STUDIOS.length,
            itemListElement: PRO_STUDIOS.map((s, i) => ({
              '@type': 'ListItem',
              position: i + 1,
              name: s.name,
              url: `https://${BRAND_DOMAIN}${s.href}`,
              description: s.tagline,
            })),
          }),
        }}
      />
    </div>
  );
}
