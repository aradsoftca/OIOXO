import type { ToolManifest, Category } from '@/lib/registry/types';
import { CATEGORIES } from '@/lib/registry/types';
import { BRAND, IS_OIOXO } from '@/lib/brand';

export interface RichSection {
  heading: string;
  body: string;
  bullets?: string[];
}

export interface RichFaq {
  q: string;
  a: string;
}

export interface RichPage {
  title: string;
  description: string;
  intro: string;
  sections: RichSection[];
  faqs: RichFaq[];
  steps: string[];
  benefits: string[];
  keywords: string[];
  relatedToolIds: string[];
}

const fmt = (s: string) => s.replace(/^.+\//, '').toUpperCase();
const acceptsLabel = (t: ToolManifest) => (t.accepts ?? []).map(fmt).filter(Boolean).join(', ');
const producesLabel = (t: ToolManifest) => (t.produces ?? []).map(fmt).filter(Boolean).join(', ');

interface CategoryProfile {
  niche: string;
  alternatives: string;
  workflows: string[];
  proAngle: string;
  technicalEdge: string;
}

const CATEGORY_PROFILES: Record<Category, CategoryProfile> = {
  image: {
    niche: 'photo editing and image processing',
    alternatives: 'Photoshop, GIMP, Affinity Photo, Canva, online editors that compress quality',
    workflows: [
      'Resize hero images for marketing sites to exact pixel dimensions, preserving sharpness with Lanczos resampling',
      'Convert raw camera files and HEIC photos to web-friendly WebP or AVIF without quality loss',
      'Batch-process hundreds of product photos: rename, watermark, resize, recompress in one pass',
      'Strip EXIF metadata, GPS coordinates, and camera serial numbers before sharing publicly',
      'Composite layered designs with blend modes, masks, and adjustment layers',
    ],
    proAngle: 'Color science is preserved end-to-end — sRGB and Display-P3 are honored, ICC profiles round-trip, and 16-bit-per-channel intermediates avoid the banding you see in cheap online editors.',
    technicalEdge: 'Uses Canvas2D and WebGL2 with OffscreenCanvas for parallel processing. Filters run as GPU shaders where supported, falling back to CPU SIMD via WebAssembly.',
  },
  audio: {
    niche: 'audio editing, mixing, and mastering',
    alternatives: 'Audacity, Adobe Audition, Reaper, Logic Pro, online converters that re-encode lossy',
    workflows: [
      'Trim podcast recordings with sample-accurate cuts, fades, and crossfades',
      'Convert MP3 / WAV / FLAC / OGG / M4A losslessly when staying in lossless, and at any bitrate when going lossy',
      'Master a track to a specific LUFS loudness target with true-peak limiting for Spotify, YouTube, Apple Music',
      'Generate professional voiceovers in 60+ languages with adjustable pitch and pace',
      'Detect key, BPM, and beats automatically for DJ sets and remix prep',
    ],
    proAngle: 'Sample-accurate editing at 32-bit float internally — no quantization noise added by intermediate steps. EBU R128 loudness metering matches DAW behavior.',
    technicalEdge: 'Web Audio API + AudioWorklet for low-latency DSP, ffmpeg.wasm for codec encoding, and a custom WASM SIMD path for time-stretching and pitch-shifting.',
  },
  video: {
    niche: 'video editing, color grading, and export',
    alternatives: 'Premiere Pro, DaVinci Resolve, Final Cut Pro, Filmora, online editors with hard limits',
    workflows: [
      'Cut, trim, and arrange clips on a multi-track timeline with frame-accurate snapping',
      'Color-grade with primary wheels, RGB curves, and parade/waveform scopes',
      'Apply LUTs, transitions, and per-clip keyframes for motion, opacity, and audio levels',
      'Burn-in captions, watermarks, and lower-thirds with custom fonts and styling',
      'Export H.264, H.265, VP9, or AV1 at any resolution and bitrate, with format-correct containers',
    ],
    proAngle: 'WebCodecs hardware-accelerated decode and encode means a 4K timeline scrubs at native speed on a recent laptop. ffmpeg.wasm handles every edge-case container and codec.',
    technicalEdge: 'Hybrid renderer: WebGL2 for color grading and effects, WebCodecs for decode/encode, ffmpeg.wasm for muxing and exotic codecs. Multi-threaded via SharedArrayBuffer where COOP/COEP is available.',
  },
  pdf: {
    niche: 'PDF editing, OCR, annotation, and signing',
    alternatives: 'Adobe Acrobat Pro, Foxit, Nitro PDF, online PDF tools that watermark output',
    workflows: [
      'Merge dozens of PDFs in any order with thumbnail preview and reorder',
      'OCR scanned PDFs in 20+ languages to make them searchable and copyable',
      'Redact sensitive information so it is truly removed from the file, not just visually hidden',
      'Add password protection, digital signatures, and form fields',
      'Split a large PDF into per-page files, or extract a specific range',
    ],
    proAngle: 'Redaction operates on the underlying object stream so deleted content cannot be recovered with a text extractor. Form fields and signatures round-trip with PDF/A compliance.',
    technicalEdge: 'pdf-lib and pdfjs-dist render and edit the PDF stream directly in your browser. Tesseract.js handles OCR with on-device language packs.',
  },
  text: {
    niche: 'text cleaning, transformation, and analysis',
    alternatives: 'Notepad++, Sublime Text macros, sed and awk scripts, online regex testers',
    workflows: [
      'Clean a copy-pasted spreadsheet of weird whitespace, smart quotes, and line endings',
      'Find-and-replace across multi-megabyte files with regex, captures, and previews',
      'Diff two pieces of text side-by-side with character-level highlighting',
      'Encode and decode Base64, URL, HTML, and ROT13 in one place',
      'Count words, characters, lines, paragraphs, and reading time for content workflows',
    ],
    proAngle: 'Handles files larger than most online editors because processing is streamed line-by-line — no full upload required. Regex testing shows match groups and timing.',
    technicalEdge: 'Native browser performance via TextDecoder streams; regex execution uses the engine\'s optimized matcher; no payload size limits.',
  },
  dev: {
    niche: 'developer utilities, encoding, hashing, and cryptography',
    alternatives: 'CyberChef, command-line tools, online crypto APIs you should never trust',
    workflows: [
      'Generate hashes (SHA-256/384/512, MD5, BLAKE3) without sending the payload anywhere',
      'Decode JWT, base64url, and hex without leaking secrets to a logging service',
      'Format and validate JSON, YAML, TOML, XML, SQL with syntax-aware error messages',
      'Compute HMAC and TOTP locally for testing API auth integrations',
      'Generate strong passwords and UUIDs using the browser\'s crypto.getRandomValues CSPRNG',
    ],
    proAngle: 'Cryptography uses the browser\'s SubtleCrypto where possible (audited, hardware-accelerated). Nothing is ever transmitted, so even your test secrets stay yours.',
    technicalEdge: 'SubtleCrypto for SHA/HMAC/AES, WebAssembly for BLAKE3 / Argon2 / scrypt, and crypto.getRandomValues for entropy.',
  },
  calc: {
    niche: 'math, scientific, financial, and engineering calculation',
    alternatives: 'TI-84, Wolfram Alpha lite, calculator.com, sketchy ad-laden calculator sites',
    workflows: [
      'Compute compound interest, loan amortization, and ROI for personal finance',
      'Solve algebra, trigonometry, and calculus problems with shown steps',
      'Compute matrix operations, derivatives, and definite integrals',
      'Convert between number bases and units across measurement systems',
      'Evaluate scientific expressions with full operator precedence and constants',
    ],
    proAngle: 'Symbolic math is computed locally with deterministic precision — no floating-point surprises on edge cases like 0.1 + 0.2.',
    technicalEdge: 'math.js for symbolic computation, KaTeX for rendering LaTeX, and arbitrary-precision arithmetic via big.js / decimal.js.',
  },
  convert: {
    niche: 'universal file conversion across formats',
    alternatives: 'CloudConvert (uploads), Online-Convert.com (slow), desktop tools (limited)',
    workflows: [
      'Drop any file and let the converter detect the right path automatically',
      'Convert across image formats (PNG ↔ JPG ↔ WebP ↔ AVIF ↔ HEIC) preserving color profiles',
      'Convert audio between MP3, WAV, FLAC, OGG, M4A, OPUS with bit-perfect quality where possible',
      'Convert video containers and codecs (MP4 ↔ WebM ↔ MOV ↔ MKV) with ffmpeg.wasm',
      'Convert documents (DOCX ↔ PDF, XLSX ↔ CSV, PPTX ↔ PDF) with formatting preserved',
    ],
    proAngle: 'Format-detection logic reads magic bytes (not extensions), so renamed files still route correctly. Conversion paths chain when needed (HEIC → PNG → AVIF).',
    technicalEdge: 'ffmpeg.wasm + libvips-wasm + pdf-lib + sheetjs + mammoth, with a routing layer that picks the best engine per pair.',
  },
  generator: {
    niche: 'generators for passwords, QR codes, colors, data, and design assets',
    alternatives: 'Random.org, 1Password generator, online QR code generators with ads',
    workflows: [
      'Generate cryptographically strong passwords and passphrases',
      'Build QR codes with custom colors, logos, error-correction levels, and SVG output',
      'Create color palettes, gradients, mesh gradients, and accessibility-aware tints',
      'Generate Lorem Ipsum, UUIDs, fake personas, and synthetic test data',
      'Build CSS effects (box-shadow, glassmorphism, animations) with a visual editor',
    ],
    proAngle: 'Randomness comes from crypto.getRandomValues — an actual CSPRNG, not Math.random. QR codes are validated against the spec for scanability.',
    technicalEdge: 'crypto.getRandomValues, qrcode-generator for QR, and color.js for OKLCH-aware color manipulation.',
  },
  time: {
    niche: 'date, time, and timezone calculation',
    alternatives: 'epochconverter.com, World Clock apps, manual spreadsheet formulas',
    workflows: [
      'Convert between Unix timestamps and ISO 8601 in any timezone',
      'Compute the difference between dates accounting for DST and timezone shifts',
      'Build and test cron expressions with next-run previews',
      'Run a countdown timer for events, deadlines, or live-stream count-ins',
      'Generate calendar files (ICS) for events without an account',
    ],
    proAngle: 'Uses the Temporal API (or robust polyfill) so timezone math and leap seconds are handled correctly.',
    technicalEdge: 'Intl.DateTimeFormat for locale, Temporal API where available, and a battle-tested cron parser.',
  },
  finance: {
    niche: 'personal finance, loan, tax, and investment calculation',
    alternatives: 'Mint, bank calculators with marketing pop-ups, generic spreadsheet templates',
    workflows: [
      'Compute mortgage payments with full amortization schedules and prepayment scenarios',
      'Compare loan offers side-by-side at different rates and terms',
      'Forecast investment returns with compound interest and contribution scheduling',
      'Estimate income tax across brackets including marginal and effective rates',
      'Plan a budget with envelope-style allocations and savings-rate analysis',
    ],
    proAngle: 'All math is transparent — every formula is shown, every assumption is editable, no hidden fees or affiliate steering.',
    technicalEdge: 'Decimal-precise arithmetic (no IEEE-754 rounding), and TVM formulas that match HP-12C and Excel exactly.',
  },
  seo: {
    niche: 'SEO and webmaster utilities',
    alternatives: 'Ahrefs (paid), Screaming Frog (desktop), SEMRush (paid)',
    workflows: [
      'Generate OpenGraph and Twitter card meta tags from a single form',
      'Build JSON-LD structured data (Article, Product, FAQ, Breadcrumb) with live preview',
      'Generate sitemap.xml and robots.txt from scratch',
      'Audit page titles and meta descriptions for optimal length',
      'Generate keyword variations and long-tail expansions',
    ],
    proAngle: 'Validators check output against the actual Google and Schema.org specs, not a checklist someone Googled.',
    technicalEdge: 'Schema.org JSON-LD validators, OpenGraph spec compliance, and length-aware text inputs.',
  },
  game: {
    niche: 'gaming utilities, name generators, randomizers',
    alternatives: 'Random tabletop apps with ads, sketchy fantasy-name generator sites',
    workflows: [
      'Roll virtual dice for D&D, Pathfinder, and tabletop RPG sessions',
      'Generate character names, guild names, and lore-flavored titles',
      'Compute DPS, loadouts, and drop-rate probabilities',
      'Convert mouse DPI and sensitivity between FPS games',
      'Test colorblind accessibility for game UI designs',
    ],
    proAngle: 'Probability math uses real distribution sampling, not Math.random scaled badly.',
    technicalEdge: 'crypto.getRandomValues for unbiased rolls; weighted-sample utilities for gacha and drop-rate modeling.',
  },
  gis: {
    niche: 'GIS, geographic coordinate, and map utilities',
    alternatives: 'QGIS (desktop), ArcGIS Online (paid), various single-purpose web tools',
    workflows: [
      'Convert coordinates between DMS, decimal degrees, MGRS, and UTM',
      'Compute great-circle distance and bearing between two points',
      'Project geometry between WGS84, Web Mercator, and UTM zones',
      'Compute area, perimeter, and centroid of polygons',
      'Convert between KML, GeoJSON, GPX, and Shapefile (where browser allows)',
    ],
    proAngle: 'Projection math uses proj4-equivalent accuracy, so coordinates round-trip without drift.',
    technicalEdge: 'proj4 for projections, turf.js for geospatial geometry, and on-device datasets for offline lookups.',
  },
  ip: {
    niche: 'IP, DNS, and network lookup utilities',
    alternatives: 'WhatIsMyIP, MXToolbox, command-line dig and nslookup',
    workflows: [
      'Look up your public IP and approximate geolocation',
      'Compute CIDR subnets, broadcast addresses, and host counts',
      'Query DNS records (A, AAAA, MX, TXT, SOA) without a terminal',
      'Decode and convert between IPv4 and IPv6 addressing formats',
      'Look up WHOIS / RDAP for domains and IP ranges',
    ],
    proAngle: 'Lookups go through our own server (proof-of-work gated), so third-party APIs never see your queries.',
    technicalEdge: 'Local subnet math; server-side DNS/WHOIS via our edge with anti-abuse pacing.',
  },
  social: {
    niche: 'social-media content creation',
    alternatives: 'Canva, Figma templates, Adobe Express',
    workflows: [
      'Generate platform-perfect avatars and banners at exact pixel sizes',
      'Build social-ready thumbnails with text and image overlays',
      'Resize and crop images for every social network in one pass',
      'Generate OG cards for blog posts and product launches',
      'Create reaction GIFs and animated profile pictures',
    ],
    proAngle: 'Templates ship with current platform dimensions (2026) — no outdated 2018 specs.',
    technicalEdge: 'Canvas2D rendering with web-fonts loaded locally; PNG/WebP/GIF/animated-WebP export.',
  },
  font: {
    niche: 'font inspection, conversion, and subsetting',
    alternatives: 'FontForge (desktop), Transfonter, online font tools that miss WOFF2 cases',
    workflows: [
      'Inspect OTF, TTF, WOFF, and WOFF2 fonts: glyphs, OS/2 tables, features',
      'Convert between font formats while preserving hinting and OpenType features',
      'Subset a large font to only the glyphs you ship — drop file size by 90%',
      'Preview text in any installed or uploaded font with adjustable size and weight',
      'Browse curated font pairings of headline + body typefaces',
    ],
    proAngle: 'Subsetting respects ligatures and language coverage — no broken glyphs after the diet.',
    technicalEdge: 'opentype.js plus harfbuzz-wasm for parsing and subsetting; WOFF2 round-trip support.',
  },
  subtitle: {
    niche: 'subtitle and caption editing, sync, and translation',
    alternatives: 'Aegisub (desktop), Subtitle Edit, YouTube caption editor',
    workflows: [
      'Auto-transcribe video and audio to SRT, VTT, ASS using on-device Whisper',
      'Sync caption timing to audio with frame-accurate offsets and per-line jog',
      'Translate captions across languages on-device, preserving timing',
      'Style captions with custom fonts, colors, outlines, and shadows',
      'Burn captions permanently into video using ffmpeg.wasm',
    ],
    proAngle: 'Speaker diarization separates multiple voices automatically. ASS styling round-trips with full SubStation Alpha spec fidelity.',
    technicalEdge: 'Whisper via transformers.js with quantized models that fit the on-device budget; ffmpeg.wasm for burn-in.',
  },
  test: {
    niche: 'browser, hardware, and skill diagnostics',
    alternatives: 'Standalone test sites for typing, keyboard, monitor, network — each with separate ads',
    workflows: [
      'Run typing-speed and CPS tests with WPM, accuracy, and consistency metrics',
      'Diagnose stuck keys, mouse buttons, and dead screen pixels',
      'Test microphone, webcam, and speaker calibration',
      'Run a network speed test using the closest server',
      'Profile browser codec support, GPU features, and screen color gamut',
    ],
    proAngle: 'Results are computed in-browser with millisecond-precise timing — no server round-trip skewing the numbers.',
    technicalEdge: 'performance.now() for timing, Gamepad / Pointer / Keyboard / WebHID APIs for device tests, WebGL/WebGPU probes for hardware capability detection.',
  },
  code: {
    niche: 'code formatting, linting, and language utilities',
    alternatives: 'Prettier CLI, ESLint CLI, online code beautifiers with banners',
    workflows: [
      'Format and lint code in 30+ languages with configurable rules',
      'Convert syntax between similar languages (TypeScript ↔ JavaScript, JSON ↔ YAML)',
      'Generate boilerplate, scaffolding, and snippets',
      'Analyze code complexity, line counts, and cyclomatic metrics',
      'Diff and merge code with three-way conflict resolution',
    ],
    proAngle: 'Runs the same Prettier and Babel parsers you would run locally — zero divergence from CLI output.',
    technicalEdge: 'Prettier in the browser via its standalone build; Babel, PostCSS, and tree-sitter for parsing.',
  },
};

function pickNlExample(tool: ToolManifest): string {
  switch (tool.category) {
    case 'image': return 'make this photo lighter and remove the background';
    case 'video': return 'cut the boring parts and add captions';
    case 'audio': return 'clean up the noise and master for Spotify';
    case 'pdf':   return 'OCR this scan and redact the names';
    case 'text':  return 'clean this CSV and dedupe by email';
    case 'dev':   return 'format this JSON and check the JWT';
    case 'calc':  return 'compute the integral and show the steps';
    case 'finance': return 'compare these two loan offers';
    case 'subtitle': return 'auto-transcribe and translate to Spanish';
    case 'convert': return 'convert this to MP4 for me';
    case 'generator': return 'make me a strong password';
    default: return 'do this for me';
  }
}

function xonvertIntro(tool: ToolManifest, profile: CategoryProfile): string {
  const accepts = acceptsLabel(tool);
  const produces = producesLabel(tool);
  const inOut = accepts && produces ? ` It takes ${accepts} and gives you ${produces}.` : '';
  // Short and specific on purpose: the old paragraph was the same on every
  // tool page with the name swapped (64% of each page was template).
  return `${tool.blurb}${inOut} It runs in your browser, so the file is processed on your own device.`;
}

function oioxoIntro(tool: ToolManifest, profile: CategoryProfile): string {
  const cat = CATEGORIES[tool.category];
  const accepts = acceptsLabel(tool);
  const produces = producesLabel(tool);
  const inOut = accepts && produces
    ? `It accepts ${accepts} input and produces ${produces}. `
    : '';
  const nichePretty = profile.niche.charAt(0).toUpperCase() + profile.niche.slice(1);
  return `${tool.blurb} ${inOut}On oioxo, ${tool.name} is also available to the on-device AI — ask the assistant in plain language ("${pickNlExample(tool)}") and it will operate this tool for you, chain it with related ${cat.name.toLowerCase()} skills, and explain what it did. ${nichePretty} becomes a conversation, not a UI puzzle.`;
}

function xonvertSections(tool: ToolManifest, profile: CategoryProfile): RichSection[] {
  // No category "workflows" list: it was identical on every tool in a category
  // and advertised features (layers, 60-language voiceovers…) most tools lack.
  const produces = producesLabel(tool);
  return [
    {
      heading: `What ${tool.name} does`,
      body: `${tool.blurb}${produces ? ` The result is a ${produces} file you download directly.` : ''}`,
    },
    {
      heading: `How it works`,
      body: `${profile.technicalEdge} The processing code runs inside the page, so your file is not uploaded to a server — you can confirm this in your browser's DevTools → Network tab.`,
    },
  ];
}

function oioxoSections(tool: ToolManifest, profile: CategoryProfile): RichSection[] {
  const cat = CATEGORIES[tool.category];
  return [
    {
      heading: `How the oioxo AI uses ${tool.name}`,
      body: `${tool.name} is registered as a callable skill on the oioxo brain — the on-device conductor model that orchestrates every tool. You can use it directly from this page, or describe what you want in plain language and the assistant will fill in the parameters, run the tool, narrate the result, and chain it with related ${cat.name.toLowerCase()} skills if needed. The conductor runs locally too, so the entire chain (intent → tool → output) stays on your device.`,
    },
    {
      heading: `What ${tool.name} does on its own`,
      body: `${tool.blurb} ${profile.proAngle}${producesLabel(tool) ? ` Output is ${producesLabel(tool)}.` : ''}`,
    },
    {
      heading: `Skill chains the AI can build with ${tool.name}`,
      body: `When you ask the oioxo assistant to do something bigger, ${tool.name} often becomes one step in a larger plan. Examples of plans the AI can run that include this tool:`,
      bullets: profile.workflows.map((w) => `${w} — orchestrated end-to-end by the assistant.`),
    },
    {
      heading: `On-device AI, not cloud AI`,
      body: `The oioxo conductor is a small, fine-tuned model that runs in your browser via WebGPU (with a WASM fallback). Specialist models for transcription, image segmentation, OCR, and translation download once and cache. Nothing about your conversation, your files, or the conductor's plan leaves your device. ${profile.technicalEdge}`,
    },
    {
      heading: `Why on-device AI matters for ${profile.niche}`,
      body: `Cloud AI providers see every prompt and every file. For ${profile.niche}, that means your work is sampled into someone else's training set. oioxo flips that — every byte of inference happens on your own hardware, so the data, the model, and the result all stay with you. ${tool.name} is part of the same trust model: no upload, no logging, no quiet retention.`,
    },
    {
      heading: `Talk to the AI vs. drive the tool directly`,
      body: `${tool.name} works both ways. You can drive the form fields yourself for full deterministic control, or let the assistant translate a natural-language request into the correct parameters. The AI sees the same parameters you see — it does not have hidden capabilities, just a translator from "what you want" to "what the tool needs".`,
    },
  ];
}

function xonvertFaqs(tool: ToolManifest, _profile: CategoryProfile): RichFaq[] {
  // Every answer must answer its own question and be true for THIS tool.
  // (The old set answered "is quality lost?" with offline text and asked about
  // AI hardware on a brand where AI is switched off.)
  return [
    {
      q: `Does ${tool.name} upload my files?`,
      a: `No. ${tool.name} runs in your browser and processes the file on your device. Nothing is sent to our servers.`,
    },
    {
      q: `Is ${tool.name} free?`,
      a: `Yes, with a daily free allowance and no signup. Xonvert Pro ($4.99/month) removes the daily limits and the watermark on exported files.`,
    },
    {
      q: `Do I need to install anything?`,
      a: `No. It works in any modern browser on Windows, macOS, Linux, ChromeOS, Android and iPad.`,
    },
  ];
}

function oioxoFaqs(tool: ToolManifest, profile: CategoryProfile): RichFaq[] {
  return [
    {
      q: `Do I have to use the AI to use ${tool.name}?`,
      a: `No. ${tool.name} works as a regular tool with form-based inputs. The AI is an alternative interface, not a required one. People who prefer pixel-perfect control use the controls directly; people who prefer "do what I mean" ask the assistant.`,
    },
    {
      q: `Does the oioxo AI send my prompt or files to a server?`,
      a: `No. The oioxo conductor model runs entirely on your device via WebGPU (with a WASM fallback for older hardware). Specialist models for transcription, OCR, image segmentation, and translation also run on-device. There is no cloud-AI provider in the loop — your prompt, your file, and the AI's plan all stay local.`,
    },
    {
      q: `What is the oioxo "conductor", and is it good at ${profile.niche}?`,
      a: `The conductor is a small, fine-tuned model trained on tool routing and intent recognition across all 300+ oioxo skills (including ${tool.name}). It does not generate content directly — instead it routes your intent to the right specialist tool, fills the parameters, runs it, and explains the result. For ${profile.niche}, that means asking "${pickNlExample(tool)}" and getting a working output.`,
    },
    {
      q: `Can I chain ${tool.name} with other tools in one request?`,
      a: `Yes — that is the main reason the AI layer exists. Examples: "${profile.workflows[0]}" or "${profile.workflows[1]}" become one prompt that runs as a multi-step plan, each step calling a different specialist tool. You see the plan before it runs and can edit any step.`,
    },
    {
      q: `How does oioxo compare to using ChatGPT for this?`,
      a: `ChatGPT generates a description of how to do ${profile.niche}. oioxo actually does it, with a deterministic tool execution that produces a real output file. The AI here is the routing layer; ${tool.name} is the engine that makes the real change to your file. And nothing leaves your device.`,
    },
    {
      q: `Is the AI free to use?`,
      a: `Yes. The conductor and the local specialist models are free to download and run on your device. Pro unlocks higher quotas, watermark removal, and larger specialist models for the most demanding jobs (e.g. higher-quality transcription). Cloud Pro can also offload select heavy jobs to our GPU when you explicitly opt in.`,
    },
    {
      q: `Does ${tool.name} work without internet?`,
      a: `Yes — once the page and any specialist models have downloaded, ${tool.name} and the conductor both work fully offline. Some lookups (e.g. real-time DNS) inherently need network, but local-only operations stay local-only.`,
    },
    {
      q: `What hardware does the AI need?`,
      a: `WebGPU is preferred for the brain — that is any 2022+ desktop GPU, recent Apple Silicon, or many recent Android devices. Older hardware falls back to a slower WASM path that still works. ${tool.name} itself runs on any modern browser regardless.`,
    },
  ];
}

function xonvertSteps(tool: ToolManifest): string[] {
  const accepts = acceptsLabel(tool);
  const produces = producesLabel(tool);
  return [
    accepts ? `Drop a ${accepts} file on the page, or click to choose one.` : `Type or paste your input.`,
    `Pick the options you want.`,
    produces ? `Download the ${produces} file.` : `Copy or save the result.`,
  ];
}

function oioxoSteps(tool: ToolManifest): string[] {
  const accepts = acceptsLabel(tool);
  return [
    `Open ${tool.name} on oioxo, or open the chat panel and ask the assistant for what you want.`,
    accepts
      ? `Drop a ${accepts} file, or attach it to the chat. The assistant can reuse a file you have already loaded in another oioxo tool.`
      : `Type your input, or describe what you want in plain English or your own language.`,
    `If you are using the AI: review the plan it proposes — which tool(s) it will call and with what parameters. Edit any step before running.`,
    `Run the operation. The oioxo brain orchestrates ${tool.name} on your device — you will see progress and a written explanation of what is happening.`,
    `Save the result, or chain follow-up steps. The assistant remembers context across the conversation, so you can iterate without re-uploading anything.`,
  ];
}

function xonvertBenefits(_tool: ToolManifest): string[] {
  return [
    `Files stay on your device — nothing is uploaded`,
    `No signup needed`,
    `Works in any modern browser, on any OS`,
    `Free daily use; Pro removes limits and watermarks`,
  ];
}

function oioxoBenefits(tool: ToolManifest): string[] {
  const cat = CATEGORIES[tool.category];
  return [
    `Talk to the AI or drive the tool yourself — both interfaces share the same engine`,
    `On-device AI: the conductor model and specialist models all run in your browser`,
    `Chain ${tool.name} with 300+ other oioxo skills via one natural-language request`,
    `Free forever — no signup, no credit card, no model subscription fee`,
    `Files and prompts stay on your device — no cloud AI provider sees your work`,
    `Works offline after first load — the AI does not need a network to think`,
    `Opens alongside 300+ related on-device ${cat.name.toLowerCase()} skills`,
  ];
}

function xonvertKeywords(tool: ToolManifest, profile: CategoryProfile): string[] {
  const seeds = new Set<string>();
  const name = tool.name.toLowerCase();
  for (const k of tool.keywords ?? []) seeds.add(k);
  seeds.add(name);
  seeds.add(`${name} online`);
  seeds.add(`free ${name}`);
  seeds.add(`${name} no upload`);
  seeds.add(`${name} no signup`);
  seeds.add(`browser ${name}`);
  seeds.add(`${name} alternative`);
  for (const alt of profile.alternatives.split(',').map((s) => s.trim()).slice(0, 3)) {
    if (!alt) continue;
    seeds.add(`${name} vs ${alt.toLowerCase()}`);
    seeds.add(`free ${alt.toLowerCase()} alternative`);
  }
  seeds.add(profile.niche);
  return Array.from(seeds).slice(0, 16);
}

function oioxoKeywords(tool: ToolManifest, profile: CategoryProfile): string[] {
  const seeds = new Set<string>();
  const name = tool.name.toLowerCase();
  for (const k of tool.keywords ?? []) seeds.add(k);
  seeds.add(`ai ${name}`);
  seeds.add(`on-device ai ${profile.niche}`);
  seeds.add(`private ai ${profile.niche}`);
  seeds.add(`local ai ${name}`);
  seeds.add(`browser ai ${name}`);
  seeds.add(`offline ai ${profile.niche}`);
  seeds.add(`ai agent ${profile.niche}`);
  seeds.add(`webgpu ai`);
  seeds.add(`${name} ai assistant`);
  seeds.add(`ai conductor ${profile.niche}`);
  seeds.add(`free ai ${profile.niche}`);
  seeds.add(`chatgpt alternative ${profile.niche}`);
  return Array.from(seeds).slice(0, 16);
}

function trunc(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 3);
  const sp = cut.lastIndexOf(' ');
  return (sp > max - 15 ? cut.slice(0, sp) : cut) + '…';
}

export function buildRichPage(tool: ToolManifest, relatedToolIds: string[] = []): RichPage {
  const profile = CATEGORY_PROFILES[tool.category];
  const cat = CATEGORIES[tool.category];

  if (IS_OIOXO) {
    const title = `${tool.name} on ${BRAND} — on-device AI for ${profile.niche}`;
    return {
      title: trunc(title, 70),
      description: trunc(`${tool.blurb} On-device AI you can talk to, or drive directly. Private. Free. Works offline.`, 160),
      intro: oioxoIntro(tool, profile),
      sections: oioxoSections(tool, profile),
      faqs: oioxoFaqs(tool, profile),
      steps: oioxoSteps(tool),
      benefits: oioxoBenefits(tool),
      keywords: oioxoKeywords(tool, profile),
      relatedToolIds: relatedToolIds.slice(0, 6),
    };
  }

  const firstRival = profile.alternatives.split(',')[0].trim();
  const title = `${tool.name} — free ${cat.name.toLowerCase()} tool, no upload, no signup`;
  return {
    title: trunc(title, 70),
    description: trunc(`${tool.blurb} Free, private, runs in your browser. ${/^[aeiou]/i.test(firstRival) ? 'An' : 'A'} ${firstRival} alternative.`, 160),
    intro: xonvertIntro(tool, profile),
    sections: xonvertSections(tool, profile),
    faqs: xonvertFaqs(tool, profile),
    steps: xonvertSteps(tool),
    benefits: xonvertBenefits(tool),
    keywords: xonvertKeywords(tool, profile),
    relatedToolIds: relatedToolIds.slice(0, 6),
  };
}

export function richPageWordCount(p: RichPage): number {
  let count = p.intro.split(/\s+/).length;
  count += p.steps.join(' ').split(/\s+/).length;
  count += p.benefits.join(' ').split(/\s+/).length;
  for (const s of p.sections) {
    count += s.heading.split(/\s+/).length;
    count += s.body.split(/\s+/).length;
    if (s.bullets) count += s.bullets.join(' ').split(/\s+/).length;
  }
  for (const f of p.faqs) {
    count += f.q.split(/\s+/).length;
    count += f.a.split(/\s+/).length;
  }
  return count;
}
