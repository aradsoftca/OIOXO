import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import Link from 'next/link';
import { TOOLS, CATEGORIES } from '@/lib/registry';
import type { Category } from '@/lib/registry/types';
import { BRAND, BRAND_DOMAIN, IS_OIOXO } from '@/lib/brand';
import { buildMeta } from '@/lib/seo/meta';
import { faqPageJsonLd, structuredDataToScript } from '@/lib/seo/jsonld';

interface Props { params: Promise<{ cat: string }>; }

const CAT_IDS = Object.keys(CATEGORIES) as Category[];

export function generateStaticParams() {
  return CAT_IDS.map((cat) => ({ cat }));
}

interface CatProfile {
  lead: string;
  workflows: string[];
  alternatives: string;
  faqs: { q: string; a: string }[];
}

function profileFor(cat: Category): CatProfile {
  const c = CATEGORIES[cat];
  const lead = c.blurb;
  const generic: CatProfile['faqs'] = [
    { q: `Are the ${BRAND} ${c.name} tools free?`, a: `Yes — every tool is free. No signup, no credit card, no trial limits. Pro removes the small export watermark on free tools and lifts daily quotas on the heaviest operations.` },
    { q: `Do my files leave my device?`, a: `No. The ${c.name} tools run entirely in your browser. Your files are processed locally and never reach our servers.` },
    { q: `Do they work offline?`, a: `Yes — once a tool page is loaded, the browser caches its code and the tool keeps working without internet.` },
    { q: `Do they work on mobile?`, a: `Yes. Every ${c.name.toLowerCase()} tool works in modern mobile browsers on Android and iOS without an app install.` },
    { q: `Can I use these for commercial work?`, a: `Yes, with no licensing fees. We don't claim rights to anything you produce.` },
  ];
  switch (cat) {
    case 'image':
      return {
        lead: `Edit, optimize, convert, and transform images directly in your browser — Lanczos-quality resizing, ICC-aware color, and lossless conversion across PNG, JPG, WebP, AVIF, HEIC.`,
        workflows: [
          'Resize hero images for marketing sites to exact pixel dimensions',
          'Convert HEIC and raw camera files to web-friendly WebP or AVIF',
          'Batch-process hundreds of product photos: rename, watermark, resize',
          'Strip EXIF metadata and GPS before sharing',
          'Composite layered designs with blend modes and masks',
        ],
        alternatives: 'Photoshop, GIMP, Affinity Photo, Canva',
        faqs: generic,
      };
    case 'audio':
      return {
        lead: `Edit, mix, master, and convert audio at studio quality — 32-bit float internals, EBU R128 loudness, sample-accurate edits.`,
        workflows: [
          'Trim podcast recordings with sample-accurate cuts and crossfades',
          'Convert MP3 / WAV / FLAC / OGG / M4A / OPUS losslessly',
          'Master a track to LUFS for Spotify, YouTube, Apple Music',
          'Generate voiceovers in 60+ languages',
          'Detect key, BPM, and beats for DJ and remix prep',
        ],
        alternatives: 'Audacity, Adobe Audition, Reaper, Logic Pro',
        faqs: generic,
      };
    case 'video':
      return {
        lead: `Edit, color grade, caption, and export video locally — WebCodecs-accelerated decode and encode plus ffmpeg.wasm for every container.`,
        workflows: [
          'Cut clips on a multi-track timeline with frame-accurate snapping',
          'Color-grade with primary wheels, RGB curves, parade and waveform scopes',
          'Apply LUTs, transitions, and per-clip keyframes',
          'Burn-in captions and watermarks',
          'Export H.264, H.265, VP9, AV1 at any resolution and bitrate',
        ],
        alternatives: 'Premiere Pro, DaVinci Resolve, Final Cut Pro',
        faqs: generic,
      };
    case 'pdf':
      return {
        lead: `Merge, split, edit, sign, annotate, OCR, and protect PDFs locally — with redaction that actually deletes content, not just hides it.`,
        workflows: [
          'Merge dozens of PDFs in any order',
          'OCR scanned PDFs in 20+ languages',
          'Redact sensitive info so it truly cannot be recovered',
          'Add password protection, signatures, and form fields',
          'Split a large PDF into per-page files',
        ],
        alternatives: 'Adobe Acrobat Pro, Foxit, Nitro PDF',
        faqs: generic,
      };
    case 'text':
      return {
        lead: `Clean, transform, encode, decode, format, and analyze text — handles files larger than most online editors via stream processing.`,
        workflows: [
          'Clean weird whitespace, smart quotes, line endings from copy-paste',
          'Find-and-replace with regex across multi-megabyte files',
          'Diff two pieces of text side-by-side',
          'Encode and decode Base64, URL, HTML, ROT13',
          'Count words, characters, lines, reading time',
        ],
        alternatives: 'Notepad++, Sublime Text, sed and awk',
        faqs: generic,
      };
    case 'dev':
      return {
        lead: `Developer utilities — JSON, regex, hashing, encoding, cryptography — without sending payloads to a remote API.`,
        workflows: [
          'Generate hashes (SHA-256/384/512, MD5, BLAKE3) locally',
          'Decode JWT, base64url, hex without leaking secrets',
          'Format and validate JSON, YAML, TOML, XML, SQL',
          'Compute HMAC and TOTP for API auth testing',
          'Generate cryptographically strong passwords and UUIDs',
        ],
        alternatives: 'CyberChef, command-line tools',
        faqs: generic,
      };
    case 'calc':
      return {
        lead: `Math, scientific, financial, and engineering calculators with full math transparency and decimal-precise arithmetic.`,
        workflows: [
          'Compute compound interest, loan amortization, ROI',
          'Solve algebra, trigonometry, calculus with shown steps',
          'Compute matrix operations, derivatives, integrals',
          'Convert between number bases and units',
          'Evaluate scientific expressions with constants',
        ],
        alternatives: 'TI-84, Wolfram Alpha lite, calculator.com',
        faqs: generic,
      };
    case 'convert':
      return {
        lead: `Universal file conversion across hundreds of format pairs — drop any file and it detects the right path automatically.`,
        workflows: [
          'Convert across image formats preserving color profiles',
          'Convert audio with bit-perfect quality where possible',
          'Convert video containers and codecs via ffmpeg.wasm',
          'Convert documents preserving formatting',
          'Detect format from magic bytes, not extensions',
        ],
        alternatives: 'CloudConvert, Online-Convert.com',
        faqs: generic,
      };
    case 'generator':
      return {
        lead: `Generate passwords, QR codes, colors, gradients, placeholders, and synthetic data with real CSPRNG randomness.`,
        workflows: [
          'Generate cryptographically strong passwords',
          'Build QR codes with custom colors, logos, error correction',
          'Create color palettes, gradients, mesh gradients',
          'Generate Lorem Ipsum, UUIDs, fake personas',
          'Build CSS effects with a visual editor',
        ],
        alternatives: 'Random.org, 1Password generator',
        faqs: generic,
      };
    case 'time':
      return {
        lead: `Time, timezone, and date utilities — accurate timezone math via the Temporal API.`,
        workflows: [
          'Convert between Unix timestamps and ISO 8601',
          'Compute date differences accounting for DST',
          'Build and test cron expressions',
          'Run countdown timers and stopwatches',
          'Generate ICS calendar files',
        ],
        alternatives: 'epochconverter.com, World Clock apps',
        faqs: generic,
      };
    case 'finance':
      return {
        lead: `Personal finance, investment, tax, and loan calculators — every formula transparent, every assumption editable.`,
        workflows: [
          'Compute mortgage payments with full amortization',
          'Compare loan offers side-by-side',
          'Forecast investment returns with compound interest',
          'Estimate income tax across brackets',
          'Plan a budget with envelope allocations',
        ],
        alternatives: 'Mint, bank calculators',
        faqs: generic,
      };
    case 'seo':
      return {
        lead: `SEO and webmaster utilities — meta tag generators, structured-data builders, sitemap helpers, all validating against the real specs.`,
        workflows: [
          'Generate OpenGraph and Twitter card meta tags',
          'Build JSON-LD structured data with live preview',
          'Generate sitemap.xml and robots.txt',
          'Audit page titles and meta descriptions',
          'Generate keyword variations and long-tails',
        ],
        alternatives: 'Ahrefs (paid), Screaming Frog, SEMRush (paid)',
        faqs: generic,
      };
    case 'game':
      return {
        lead: `Gaming utilities, name generators, dice rollers, and randomizers — with real distribution sampling, not Math.random scaled badly.`,
        workflows: [
          'Roll virtual dice for D&D, Pathfinder, tabletop RPGs',
          'Generate character names and lore-flavored titles',
          'Compute DPS, loadouts, drop-rate probabilities',
          'Convert mouse DPI and sensitivity between FPS games',
          'Test colorblind accessibility for game UI',
        ],
        alternatives: 'random tabletop apps with ads',
        faqs: generic,
      };
    case 'gis':
      return {
        lead: `GIS, geographic coordinate, and map utilities with proj4-level accuracy.`,
        workflows: [
          'Convert coordinates between DMS, decimal, MGRS, UTM',
          'Compute great-circle distance and bearing',
          'Project geometry between WGS84, Web Mercator, UTM',
          'Compute area, perimeter, centroid of polygons',
          'Convert between KML, GeoJSON, GPX',
        ],
        alternatives: 'QGIS (desktop), ArcGIS Online (paid)',
        faqs: generic,
      };
    case 'ip':
      return {
        lead: `IP, DNS, network, and lookup utilities — your own server proxies the queries so third-party APIs never see them.`,
        workflows: [
          'Look up your public IP and approximate geolocation',
          'Compute CIDR subnets, broadcast addresses',
          'Query DNS records (A, AAAA, MX, TXT, SOA)',
          'Decode and convert between IPv4 and IPv6',
          'Look up WHOIS / RDAP for domains and IP ranges',
        ],
        alternatives: 'WhatIsMyIP, MXToolbox, dig and nslookup',
        faqs: generic,
      };
    case 'social':
      return {
        lead: `Tools for content creators — avatars, banners, OG cards, thumbnails — with current platform dimensions.`,
        workflows: [
          'Generate platform-perfect avatars and banners',
          'Build social-ready thumbnails with text overlays',
          'Resize for every social network in one pass',
          'Generate OG cards for blog posts and launches',
          'Create reaction GIFs and animated profile pictures',
        ],
        alternatives: 'Canva, Figma templates, Adobe Express',
        faqs: generic,
      };
    case 'font':
      return {
        lead: `Font inspection, conversion, and subsetting — preserving hinting and OpenType features.`,
        workflows: [
          'Inspect OTF, TTF, WOFF, WOFF2 fonts',
          'Convert between font formats',
          'Subset to only the glyphs you ship',
          'Preview text in any uploaded font',
          'Browse curated font pairings',
        ],
        alternatives: 'FontForge (desktop), Transfonter',
        faqs: generic,
      };
    case 'subtitle':
      return {
        lead: `Subtitle and caption tools — auto-transcribe, sync, translate, style, and burn-in captions, all on-device.`,
        workflows: [
          'Auto-transcribe video and audio to SRT, VTT, ASS',
          'Sync caption timing with frame-accurate offsets',
          'Translate captions across languages on-device',
          'Style captions with fonts, colors, shadows',
          'Burn captions permanently into video via ffmpeg.wasm',
        ],
        alternatives: 'Aegisub (desktop), Subtitle Edit',
        faqs: generic,
      };
    case 'test':
      return {
        lead: `Browser, hardware, and skill diagnostics with millisecond-precise timing in the browser.`,
        workflows: [
          'Run typing-speed and CPS tests with WPM and accuracy',
          'Diagnose stuck keys, mouse buttons, dead pixels',
          'Test microphone, webcam, speaker calibration',
          'Run a network speed test',
          'Profile browser codec, GPU, and color gamut',
        ],
        alternatives: 'standalone test sites for each diagnostic',
        faqs: generic,
      };
    case 'code':
      return {
        lead: `Code formatting, linting, and language utilities — Prettier and Babel parsers running locally with zero CLI divergence.`,
        workflows: [
          'Format and lint code in 30+ languages',
          'Convert syntax between similar languages',
          'Generate boilerplate, scaffolding, snippets',
          'Analyze code complexity and cyclomatic metrics',
          'Diff and merge code with three-way conflict resolution',
        ],
        alternatives: 'Prettier CLI, ESLint CLI',
        faqs: generic,
      };
    default:
      return { lead, workflows: [], alternatives: 'desktop alternatives', faqs: generic };
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { cat } = await params;
  if (!CAT_IDS.includes(cat as Category)) return {};
  const c = CATEGORIES[cat as Category];
  const profile = profileFor(cat as Category);
  return buildMeta({
    path: `/tools/c/${cat}`,
    title: IS_OIOXO
      ? `${c.name} tools on ${BRAND} — on-device AI for ${c.name.toLowerCase()}`
      : `${c.name} tools — free, browser-based, no upload`,
    description: profile.lead,
    keywords: [
      `${c.name.toLowerCase()} tools`,
      `free ${c.name.toLowerCase()} tools`,
      `online ${c.name.toLowerCase()} tools`,
      `browser ${c.name.toLowerCase()} editor`,
      `${c.name.toLowerCase()} no upload`,
      `${c.name.toLowerCase()} no signup`,
      ...(IS_OIOXO ? [`ai ${c.name.toLowerCase()} tools`, `on-device ai ${c.name.toLowerCase()}`] : []),
    ],
  });
}

export default async function CategoryPage({ params }: Props) {
  const { cat } = await params;
  if (!CAT_IDS.includes(cat as Category)) notFound();
  const c = CATEGORIES[cat as Category];
  const profile = profileFor(cat as Category);
  const tools = TOOLS.filter((t) => t.category === cat);
  const pinned = tools.filter((t) => t.pinDefault);
  const others = tools.filter((t) => !t.pinDefault);

  const itemList = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `${c.name} tools on ${BRAND}`,
    numberOfItems: tools.length,
    itemListElement: tools.map((t, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: `https://${BRAND_DOMAIN}/tools/${t.id}`,
      name: t.name,
      description: t.blurb,
    })),
  };

  return (
    <div className="mx-auto w-[min(1100px,96vw)] py-6 space-y-10">
      <header className="space-y-3">
        <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">
          <Link href="/" className="hover:underline">{BRAND}</Link> · <Link href="/tools" className="hover:underline">Tools</Link> · {c.name}
        </div>
        <h1 className="text-[36px] font-extrabold leading-tight tracking-tight text-[var(--color-fg)]">
          {c.name} tools — {tools.length} free, in your browser
        </h1>
        <p className="max-w-2xl text-[15px] leading-relaxed text-[var(--color-fg-muted)]">{profile.lead}</p>
      </header>

      {pinned.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-[11px] font-bold uppercase tracking-[0.2em] text-[var(--color-fg-muted)]">Most popular</h2>
          <div className="grid grid-cols-1 gap-[2px] sm:grid-cols-2 lg:grid-cols-3">
            {pinned.map((t) => (
              <Link key={t.id} href={`/tools/${t.id}`} className="group block bg-[var(--color-surface-1)] p-4 transition hover:bg-[var(--color-surface-2)]">
                <div className="text-[15px] font-bold tracking-tight text-[var(--color-fg)]">{t.name}</div>
                <div className="mt-1 line-clamp-2 text-[12px] text-[var(--color-fg-muted)]">{t.blurb}</div>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-[11px] font-bold uppercase tracking-[0.2em] text-[var(--color-fg-muted)]">All {c.name.toLowerCase()} tools</h2>
        <div className="grid grid-cols-1 gap-[2px] sm:grid-cols-2 lg:grid-cols-3">
          {others.map((t) => (
            <Link key={t.id} href={`/tools/${t.id}`} className="group block bg-[var(--color-surface-1)] p-4 transition hover:bg-[var(--color-surface-2)]">
              <div className="text-[14px] font-semibold tracking-tight text-[var(--color-fg)]">{t.name}</div>
              <div className="mt-1 line-clamp-2 text-[12px] text-[var(--color-fg-muted)]">{t.blurb}</div>
            </Link>
          ))}
        </div>
      </section>

      {profile.workflows.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-[20px] font-bold tracking-tight">What people do with the {c.name.toLowerCase()} tools</h2>
          <ul className="space-y-1.5 text-[14px] text-[var(--color-fg-muted)]">
            {profile.workflows.map((w, i) => (
              <li key={i} className="flex gap-2"><span className="text-[var(--color-fg)]">·</span><span>{w}</span></li>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-[20px] font-bold tracking-tight">Why {BRAND} {c.name}</h2>
        <p className="max-w-3xl text-[14px] leading-relaxed text-[var(--color-fg-muted)]">
          Compared with {profile.alternatives}, {BRAND}&apos;s {c.name.toLowerCase()} tools trade install, license, and account for a URL. {IS_OIOXO
            ? `On oioxo, every tool is also a callable skill the on-device AI can invoke — describe the result you want and the assistant runs the right tool(s) for you, on your device.`
            : `Free, private, fast, and offline-capable once loaded. The depth a desktop tool offers, with none of the friction.`}
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-[20px] font-bold tracking-tight">Frequently asked questions</h2>
        <div className="space-y-2">
          {profile.faqs.map((f, i) => (
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
        dangerouslySetInnerHTML={{ __html: structuredDataToScript(itemList) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: structuredDataToScript(faqPageJsonLd(profile.faqs)) }}
      />
    </div>
  );
}
