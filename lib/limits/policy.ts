/**
 * Per-tool / per-studio / per-app limit policy.
 *
 * ⚠️ COUNT IS NOT OWNED HERE. The `count-day` lever in this file is DEAD for
 * enforcement — the runtime count authority is lib/usage/config.ts
 * (GATED_LIMITS + GATED_TOOL_LIMITS + APP_LIMITS), read via /api/usage. The
 * count-day numbers below are kept ONLY so getAllPolicies()/getPolicy() stay
 * shape-complete and so the per-tool DISPLAY name resolves; nothing reads them
 * for gating, and PolicyHint now shows the real config count. When you want to
 * change a daily cap, edit config.ts, NOT here. (A dev-time assertion in
 * getAllPolicies warns if a count-day value here diverges from config.)
 *
 * This file IS the source of truth for every QUALITATIVE lever (input-size on
 * heavy tools, input-duration, output-resolution/bitrate/fps, pages, rows,
 * tracks, layers, batch, participants, session/recording-minutes, ai-minutes,
 * formats, history) and the per-tool `watermarkFree` flag.
 *
 * Design philosophy (what the policy is trying to balance):
 *   1. Free users must always EXPERIENCE the full tool — limits live at the
 *      OUTPUT moment, not in the editor. The 1080p slider is visible to
 *      everyone, you just can't export 1080p without Pro.
 *   2. "Two free + 30s gate + paywall" is the COUNT baseline. Nothing else.
 *   3. Each tool/app/studio gets bespoke ADDITIONAL levers matched to its
 *      nature — see TIERS below. Levers compose: any single one can trigger
 *      the gate.
 *   4. Levers fall into THREE response classes:
 *        • 'block'      — hard stop, show paywall (e.g. video > 60s on free)
 *        • 'watermark'  — proceed but stamp the output (e.g. 720p video, MP3)
 *        • 'degrade'    — proceed at lower quality/resolution (e.g. 1080p→720p)
 *      Most levers are 'block'; watermark is the universal soft signal.
 *   5. Top-of-funnel tools (text, calc, generators, time, dev) are NEVER gated
 *      — they cost nothing, build trust, and drive SEO. Hard rule.
 *
 * TIERS (how a tool is positioned, NOT how a user is positioned):
 *   • always-free      — text/calc/generators/time/dev/seo/game/font/social
 *   • top-of-funnel    — image edit, audio convert, simple converts
 *   • standard         — pdf/video/audio editing, OCR, transcription
 *   • sample-only      — Studios (Image/Video/Voice/Music/Sub/PDF/Sheets/Docs/
 *                        Slides) — free shows it WORKS at demo quality,
 *                        Pro unlocks real output
 *
 * REVIEW THIS FILE before changing limits — every number here is a marketing
 * decision, not just a technical one.
 */

export type LeverType =
  // existing
  | 'count-day'        // free actions per UTC day (the meter)
  | 'input-size'       // max input file size in bytes
  // new (per the design)
  | 'input-duration'   // max input audio/video length, seconds
  | 'output-resolution' // max export resolution (height in px, e.g. 720 / 1080 / 2160)
  | 'output-bitrate'   // max audio export bitrate, kbps
  | 'output-fps'       // max export frame rate
  | 'pages'            // max document pages (PDF, slides, docs)
  | 'rows'             // max spreadsheet rows
  | 'tracks'           // max video/audio timeline tracks
  | 'layers'           // max image layers
  | 'batch'            // max files in a batch op
  | 'participants'     // max people in a call/watch/chat group
  | 'session-minutes'  // max minutes per call/watch session
  | 'recording-minutes' // max minutes of recording per session
  | 'ai-minutes-day'   // max minutes of on-device AI inference (captions, TTS) per day
  | 'project-saves'    // max local library projects saved
  | 'formats'          // allowed output format whitelist (free)
  | 'history-days';    // P2P chat history window

export type Response = 'block' | 'watermark' | 'degrade';

export interface Lever {
  type: LeverType;
  free: number;          // free-tier cap (Infinity = uncapped)
  pro?: number;          // pro cap, default Infinity
  unit?: string;         // 'MB', 'min', 'p', 'fps', 'pages', 'rows', etc.
  label: string;         // shown in paywall + inline ProBadge
  /** What happens when the cap is reached on free. */
  response: Response;
  /** Output formats whitelist used by 'formats' levers. Pro = no list = all. */
  freeFormats?: string[];
}

export type ToolTier =
  | 'always-free'
  | 'top-of-funnel'
  | 'standard'
  | 'sample-only';

export interface ToolPolicy {
  key: string;          // matches gate meter key (category, tool-id, or app-id)
  displayName: string;
  tier: ToolTier;
  levers: Lever[];
  /** Free outputs carry the brand watermark (image/video/pdf footer, etc.). */
  watermarkFree: boolean;
  /** Lines shown in the paywall to make Pro value obvious for this tool. */
  proValueProp: string[];
}

// =============================================================================
// CATEGORIES (top of funnel + standard tools whose UI is per-tool but limits
// are per-category)
// =============================================================================

const CATEGORY_POLICIES: ToolPolicy[] = [
  {
    key: 'image', displayName: 'Image tools', tier: 'top-of-funnel',
    levers: [
      { type: 'count-day', free: 5, label: 'Daily uses', response: 'block' },
      { type: 'input-size', free: 25 * 1024 * 1024, unit: 'MB', label: 'Max input size', response: 'block' },
      { type: 'output-resolution', free: 4096, pro: 16384, unit: 'p', label: 'Max output resolution', response: 'degrade' },
      { type: 'batch', free: 10, label: 'Batch size', response: 'block' },
    ],
    watermarkFree: true,
    proValueProp: ['Unlimited daily uses', 'No watermark', '8K+ output', 'Unlimited batch'],
  },
  {
    key: 'audio', displayName: 'Audio tools', tier: 'top-of-funnel',
    levers: [
      { type: 'count-day', free: 3, label: 'Daily uses', response: 'block' },
      { type: 'input-size', free: 50 * 1024 * 1024, unit: 'MB', label: 'Max input size', response: 'block' },
      { type: 'input-duration', free: 10 * 60, unit: 'min', label: 'Max audio length', response: 'block' },
      { type: 'output-bitrate', free: 192, pro: 320, unit: 'kbps', label: 'Max export bitrate', response: 'degrade' },
      { type: 'formats', free: 0, label: 'Free formats', response: 'block', freeFormats: ['mp3', 'wav', 'ogg'] },
    ],
    watermarkFree: false,
    proValueProp: ['Unlimited daily uses', '320 kbps export', 'FLAC / OPUS / M4A', 'No length limit'],
  },
  {
    key: 'video', displayName: 'Video tools', tier: 'standard',
    levers: [
      { type: 'count-day', free: 2, label: 'Daily exports', response: 'block' },
      { type: 'input-size', free: 100 * 1024 * 1024, unit: 'MB', label: 'Max input size', response: 'block' },
      { type: 'input-duration', free: 3 * 60, unit: 'min', label: 'Max input length', response: 'block' },
      { type: 'output-resolution', free: 720, pro: 2160, unit: 'p', label: 'Max output resolution', response: 'degrade' },
      { type: 'output-fps', free: 30, pro: 60, unit: 'fps', label: 'Max output frame rate', response: 'degrade' },
      { type: 'formats', free: 0, label: 'Free formats', response: 'block', freeFormats: ['mp4', 'webm'] },
    ],
    watermarkFree: true,
    proValueProp: ['Unlimited exports', '4K / 60fps', 'No watermark', 'MOV / MKV / AV1', '30 min videos'],
  },
  {
    key: 'pdf', displayName: 'PDF tools', tier: 'standard',
    levers: [
      { type: 'count-day', free: 2, label: 'Daily uses', response: 'block' },
      { type: 'input-size', free: 30 * 1024 * 1024, unit: 'MB', label: 'Max input size', response: 'block' },
      { type: 'pages', free: 100, unit: 'pages', label: 'Max pages', response: 'block' },
    ],
    watermarkFree: true,
    proValueProp: ['Unlimited PDFs/day', 'No page cap', 'No watermark', 'OCR all languages', '500 MB inputs'],
  },
  {
    key: 'convert', displayName: 'File converter', tier: 'top-of-funnel',
    levers: [
      { type: 'count-day', free: 5, label: 'Daily conversions', response: 'block' },
      { type: 'input-size', free: 50 * 1024 * 1024, unit: 'MB', label: 'Max input size', response: 'block' },
      { type: 'batch', free: 5, label: 'Batch size', response: 'block' },
    ],
    watermarkFree: false,
    proValueProp: ['Unlimited conversions', '500 MB files', 'Unlimited batch'],
  },
  {
    key: 'subtitle', displayName: 'Subtitles', tier: 'standard',
    levers: [
      { type: 'count-day', free: 2, label: 'Daily exports', response: 'block' },
      { type: 'input-size', free: 10 * 1024 * 1024, unit: 'MB', label: 'Max input size', response: 'block' },
      { type: 'ai-minutes-day', free: 5, pro: 240, unit: 'min', label: 'Daily transcription minutes', response: 'block' },
    ],
    watermarkFree: true,
    proValueProp: ['4 hours of transcription/day', 'All caption formats', 'Larger model = higher accuracy', 'No burn-in watermark'],
  },
  {
    key: 'font', displayName: 'Font tools', tier: 'top-of-funnel',
    levers: [
      { type: 'count-day', free: 3, label: 'Daily uses', response: 'block' },
      { type: 'input-size', free: 10 * 1024 * 1024, unit: 'MB', label: 'Max input size', response: 'block' },
    ],
    watermarkFree: false,
    proValueProp: ['Unlimited daily uses', 'Subsetting at scale'],
  },
  {
    key: 'social', displayName: 'Social assets', tier: 'top-of-funnel',
    levers: [
      { type: 'count-day', free: 3, label: 'Daily exports', response: 'block' },
    ],
    watermarkFree: true,
    proValueProp: ['Unlimited exports', 'No watermark', 'Premium templates'],
  },
];

// =============================================================================
// PRO STUDIOS — the "sample-only" tier. Editor is fully open; gates fire at
// EXPORT and at premium internals (multi-track count, layer count, etc.).
// =============================================================================

const STUDIO_POLICIES: ToolPolicy[] = [
  {
    key: 'image-studio', displayName: 'Image Studio', tier: 'sample-only',
    levers: [
      { type: 'count-day', free: 2, label: 'Daily exports', response: 'block' },
      { type: 'input-size', free: 25 * 1024 * 1024, unit: 'MB', label: 'Max import size', response: 'block' },
      { type: 'layers', free: 6, pro: 64, label: 'Layers', response: 'block' },
      { type: 'output-resolution', free: 2048, pro: 16384, unit: 'p', label: 'Export resolution', response: 'degrade' },
      { type: 'project-saves', free: 5, label: 'Saved projects', response: 'block' },
      { type: 'formats', free: 0, label: 'Free formats', response: 'block', freeFormats: ['png', 'jpg', 'webp'] },
    ],
    watermarkFree: true,
    proValueProp: [
      'Unlimited exports — no daily cap',
      '64 layers (vs 6 on free)',
      'Up to 16K export resolution',
      'AVIF / TIFF / PSD export',
      'No watermark on exports',
      'Unlimited project library',
    ],
  },
  {
    key: 'video-studio', displayName: 'Video Studio', tier: 'sample-only',
    levers: [
      { type: 'count-day', free: 2, label: 'Daily exports', response: 'block' },
      { type: 'input-size', free: 200 * 1024 * 1024, unit: 'MB', label: 'Max import size', response: 'block' },
      { type: 'input-duration', free: 2 * 60, unit: 'min', label: 'Timeline length', response: 'block' },
      { type: 'tracks', free: 2, pro: 6, label: 'Timeline tracks', response: 'block' },
      { type: 'output-resolution', free: 720, pro: 2160, unit: 'p', label: 'Export resolution', response: 'degrade' },
      { type: 'output-fps', free: 30, pro: 60, unit: 'fps', label: 'Export frame rate', response: 'degrade' },
      { type: 'project-saves', free: 3, label: 'Saved projects', response: 'block' },
      { type: 'formats', free: 0, label: 'Free formats', response: 'block', freeFormats: ['mp4', 'webm'] },
    ],
    watermarkFree: true,
    proValueProp: [
      'Unlimited exports',
      '4K / 60 fps output',
      '6 tracks (vs 2 on free)',
      '30 min timelines (vs 2 min)',
      'MOV / MKV / AV1 / HEVC',
      'No watermark on exports',
    ],
  },
  {
    key: 'audio-voice-studio', displayName: 'Voice Studio', tier: 'sample-only',
    levers: [
      { type: 'count-day', free: 2, label: 'Daily exports', response: 'block' },
      { type: 'input-duration', free: 5 * 60, unit: 'min', label: 'Max recording length', response: 'block' },
      { type: 'tracks', free: 2, pro: 12, label: 'Voice tracks', response: 'block' },
      { type: 'output-bitrate', free: 192, pro: 320, unit: 'kbps', label: 'Export bitrate', response: 'degrade' },
      { type: 'formats', free: 0, label: 'Free formats', response: 'block', freeFormats: ['mp3', 'wav'] },
      { type: 'ai-minutes-day', free: 5, pro: 240, unit: 'min', label: 'TTS / transcription per day', response: 'block' },
    ],
    watermarkFree: true,
    proValueProp: [
      'Unlimited length recordings',
      '12 voice tracks',
      'FLAC / OPUS / M4A export',
      '4 hours of TTS / transcription daily',
      'Master chain unlocked',
    ],
  },
  {
    key: 'audio-music-studio', displayName: 'Music Studio', tier: 'sample-only',
    levers: [
      { type: 'count-day', free: 2, label: 'Daily exports', response: 'block' },
      { type: 'tracks', free: 4, pro: 16, label: 'Instrument tracks', response: 'block' },
      { type: 'input-duration', free: 32, unit: 'bars', label: 'Pattern length', response: 'block' },
      { type: 'output-bitrate', free: 192, pro: 320, unit: 'kbps', label: 'Export bitrate', response: 'degrade' },
      { type: 'formats', free: 0, label: 'Free formats', response: 'block', freeFormats: ['mp3', 'wav'] },
    ],
    watermarkFree: true,
    proValueProp: [
      '16 instrument tracks',
      'Unlimited pattern length',
      'WAV / FLAC / MIDI export',
      'Master chain unlocked',
      'Audio→MIDI included',
    ],
  },
  {
    key: 'subtitle-studio', displayName: 'Subtitle Studio', tier: 'sample-only',
    levers: [
      { type: 'count-day', free: 2, label: 'Daily exports', response: 'block' },
      { type: 'ai-minutes-day', free: 5, pro: 240, unit: 'min', label: 'Auto-transcription per day', response: 'block' },
      { type: 'input-duration', free: 10 * 60, unit: 'min', label: 'Max input length', response: 'block' },
      { type: 'formats', free: 0, label: 'Free formats', response: 'block', freeFormats: ['srt'] },
    ],
    watermarkFree: true,
    proValueProp: [
      '4 hours of transcription daily',
      'VTT / ASS / SUB export',
      'Larger Whisper model = higher accuracy',
      'Burn-in without watermark',
      'Speaker diarization unlimited',
    ],
  },
  {
    key: 'pdf-studio', displayName: 'PDF Studio', tier: 'sample-only',
    levers: [
      { type: 'count-day', free: 2, label: 'Daily exports', response: 'block' },
      { type: 'input-size', free: 30 * 1024 * 1024, unit: 'MB', label: 'Max input size', response: 'block' },
      { type: 'pages', free: 50, unit: 'pages', label: 'Max pages', response: 'block' },
      { type: 'ai-minutes-day', free: 5, pro: 240, unit: 'min', label: 'Daily OCR minutes', response: 'block' },
    ],
    watermarkFree: true,
    proValueProp: [
      'Unlimited pages',
      'OCR in 20+ languages, unlimited',
      'Signatures + Smart Redact unlimited',
      'No watermark',
      '500 MB inputs',
    ],
  },
  {
    key: 'office-studio', displayName: 'Sheets Studio', tier: 'sample-only',
    levers: [
      { type: 'count-day', free: 3, label: 'Daily exports', response: 'block' },
      { type: 'rows', free: 1000, pro: 1_000_000, label: 'Max rows', response: 'block' },
      { type: 'tracks', free: 3, pro: 50, label: 'Sheets per workbook', response: 'block' },
      { type: 'formats', free: 0, label: 'Free formats', response: 'block', freeFormats: ['csv', 'xlsx'] },
    ],
    watermarkFree: true,
    proValueProp: [
      'Up to 1M rows per sheet',
      '50 sheets per workbook',
      'XLSX / ODS / Numbers export',
      '140 formulas + pivot + charts',
      'Live collaboration unlimited',
    ],
  },
  {
    key: 'office-docs', displayName: 'Docs Studio', tier: 'sample-only',
    levers: [
      { type: 'count-day', free: 3, label: 'Daily exports', response: 'block' },
      { type: 'pages', free: 20, unit: 'pages', label: 'Max pages', response: 'block' },
      { type: 'formats', free: 0, label: 'Free formats', response: 'block', freeFormats: ['docx', 'pdf'] },
      { type: 'ai-minutes-day', free: 5, pro: 240, unit: 'min', label: 'Daily AI minutes (summarize/rewrite)', response: 'block' },
    ],
    watermarkFree: true,
    proValueProp: [
      'Unlimited pages',
      'ODT / RTF / MD export',
      'Unlimited AI rewrite / summarize',
      'Live collaboration unlimited',
      'Track changes',
    ],
  },
  {
    key: 'office-slides', displayName: 'Slides Studio', tier: 'sample-only',
    levers: [
      { type: 'count-day', free: 3, label: 'Daily exports', response: 'block' },
      { type: 'pages', free: 20, unit: 'slides', label: 'Max slides', response: 'block' },
      { type: 'formats', free: 0, label: 'Free formats', response: 'block', freeFormats: ['pptx', 'pdf'] },
    ],
    watermarkFree: true,
    proValueProp: [
      'Unlimited slides',
      'ODP / Keynote export',
      'SmartArt + 24 animations',
      'Live collaboration unlimited',
      'No watermark',
    ],
  },
];

// =============================================================================
// HEAVY INDIVIDUAL TOOLS — bespoke per-tool entries for tools whose nature
// warrants a lever beyond the category default (OCR, upscale, AI transcription,
// batch ops, big-canvas creators, format converters). Their `key` MUST match
// the tool id (so it overrides the category meter), and the category meter is
// effectively bypassed for them.
// =============================================================================

const HEAVY_TOOL_POLICIES: ToolPolicy[] = [
  // ---- Image: AI / heavy ----
  {
    key: 'image-ocr', displayName: 'Image OCR', tier: 'standard',
    levers: [
      { type: 'count-day', free: 3, label: 'Daily OCR runs', response: 'block' },
      { type: 'input-size', free: 10 * 1024 * 1024, unit: 'MB', label: 'Max image size', response: 'block' },
      { type: 'ai-minutes-day', free: 5, pro: 240, unit: 'min', label: 'Daily OCR minutes', response: 'block' },
    ],
    watermarkFree: false,
    proValueProp: ['Unlimited OCR/day', '4h OCR minutes daily', 'All language packs', 'Higher accuracy model'],
  },
  {
    key: 'image-upscale', displayName: 'Image Upscale (AI)', tier: 'sample-only',
    levers: [
      { type: 'count-day', free: 2, label: 'Daily upscales', response: 'block' },
      { type: 'input-size', free: 8 * 1024 * 1024, unit: 'MB', label: 'Max input size', response: 'block' },
      { type: 'output-resolution', free: 2048, pro: 8192, unit: 'p', label: 'Max output', response: 'degrade' },
    ],
    watermarkFree: true,
    proValueProp: ['Unlimited upscales', '8K output (vs 2K)', 'Higher quality model', 'No watermark'],
  },
  {
    key: 'image-remove-bg', displayName: 'Background remover', tier: 'top-of-funnel',
    levers: [
      { type: 'count-day', free: 5, label: 'Daily uses', response: 'block' },
      { type: 'input-size', free: 15 * 1024 * 1024, unit: 'MB', label: 'Max input size', response: 'block' },
    ],
    watermarkFree: true,
    proValueProp: ['Unlimited daily uses', 'No watermark', 'Higher edge quality'],
  },
  {
    key: 'image-smart-cutout', displayName: 'Smart Cutout (AI)', tier: 'sample-only',
    levers: [
      { type: 'count-day', free: 2, label: 'Daily uses', response: 'block' },
      { type: 'input-size', free: 15 * 1024 * 1024, unit: 'MB', label: 'Max input size', response: 'block' },
    ],
    watermarkFree: true,
    proValueProp: ['Unlimited cutouts', 'No watermark', 'Better edges'],
  },
  {
    key: 'image-enhance', displayName: 'Photo Enhance (AI)', tier: 'sample-only',
    levers: [
      { type: 'count-day', free: 2, label: 'Daily enhances', response: 'block' },
      { type: 'input-size', free: 10 * 1024 * 1024, unit: 'MB', label: 'Max input size', response: 'block' },
      { type: 'output-resolution', free: 2048, pro: 8192, unit: 'p', label: 'Max output resolution', response: 'degrade' },
    ],
    watermarkFree: true,
    proValueProp: ['Unlimited daily', '8K output', 'No watermark', 'Higher-fidelity model'],
  },
  {
    key: 'image-object-remove', displayName: 'Object Remove (AI)', tier: 'sample-only',
    levers: [
      { type: 'count-day', free: 2, label: 'Daily removals', response: 'block' },
      { type: 'input-size', free: 10 * 1024 * 1024, unit: 'MB', label: 'Max input size', response: 'block' },
    ],
    watermarkFree: true,
    proValueProp: ['Unlimited removals', 'No watermark'],
  },
  {
    key: 'image-doc-scan', displayName: 'Document Scan', tier: 'standard',
    levers: [
      { type: 'count-day', free: 3, label: 'Daily scans', response: 'block' },
      { type: 'batch', free: 5, label: 'Batch pages', response: 'block' },
    ],
    watermarkFree: true,
    proValueProp: ['Unlimited scans', 'Unlimited batch', 'No watermark'],
  },
  {
    key: 'image-passport', displayName: 'Passport Photo', tier: 'standard',
    levers: [{ type: 'count-day', free: 2, label: 'Daily exports', response: 'block' }],
    watermarkFree: true,
    proValueProp: ['Unlimited exports', 'No watermark', 'Print-ready PDF'],
  },
  {
    key: 'image-heic-convert', displayName: 'HEIC convert', tier: 'top-of-funnel',
    levers: [
      { type: 'count-day', free: 5, label: 'Daily conversions', response: 'block' },
      { type: 'batch', free: 10, label: 'Batch size', response: 'block' },
    ],
    watermarkFree: false,
    proValueProp: ['Unlimited conversions', 'Unlimited batch'],
  },
  // ---- Image: batch ----
  {
    key: 'image-batch-resize', displayName: 'Batch Image Resize', tier: 'top-of-funnel',
    levers: [
      { type: 'count-day', free: 3, label: 'Daily batches', response: 'block' },
      { type: 'batch', free: 10, pro: 1000, label: 'Files per batch', response: 'block' },
      { type: 'input-size', free: 25 * 1024 * 1024, unit: 'MB', label: 'Max per file', response: 'block' },
    ],
    watermarkFree: true,
    proValueProp: ['Unlimited batches', '1000 files per batch', 'No watermark'],
  },
  {
    key: 'image-batch-compress', displayName: 'Batch Image Compress', tier: 'top-of-funnel',
    levers: [
      { type: 'count-day', free: 3, label: 'Daily batches', response: 'block' },
      { type: 'batch', free: 10, pro: 1000, label: 'Files per batch', response: 'block' },
      { type: 'input-size', free: 25 * 1024 * 1024, unit: 'MB', label: 'Max per file', response: 'block' },
    ],
    watermarkFree: false,
    proValueProp: ['Unlimited batches', '1000 files per batch'],
  },
  {
    key: 'image-batch-convert', displayName: 'Batch Image Convert', tier: 'top-of-funnel',
    levers: [
      { type: 'count-day', free: 3, label: 'Daily batches', response: 'block' },
      { type: 'batch', free: 10, pro: 1000, label: 'Files per batch', response: 'block' },
      { type: 'input-size', free: 25 * 1024 * 1024, unit: 'MB', label: 'Max per file', response: 'block' },
    ],
    watermarkFree: false,
    proValueProp: ['Unlimited batches', '1000 files per batch'],
  },

  // ---- Video: heavy ffmpeg ops ----
  {
    key: 'video-convert-format', displayName: 'Video Convert', tier: 'standard',
    levers: [
      { type: 'count-day', free: 3, label: 'Daily conversions', response: 'block' },
      { type: 'input-size', free: 250 * 1024 * 1024, unit: 'MB', label: 'Max input size', response: 'block' },
      { type: 'input-duration', free: 3 * 60, unit: 'min', label: 'Max input length', response: 'block' },
      { type: 'output-resolution', free: 1080, pro: 2160, unit: 'p', label: 'Max output', response: 'degrade' },
      { type: 'formats', free: 0, label: 'Free formats', response: 'block', freeFormats: ['mp4', 'webm'] },
    ],
    watermarkFree: true,
    proValueProp: ['Unlimited daily', '4K output', 'MOV / MKV / AV1', '30 min videos', 'No watermark'],
  },
  {
    key: 'video-compress', displayName: 'Video Compress', tier: 'standard',
    levers: [
      { type: 'count-day', free: 4, label: 'Daily compresses', response: 'block' },
      { type: 'input-size', free: 500 * 1024 * 1024, unit: 'MB', label: 'Max input size', response: 'block' },
      { type: 'input-duration', free: 5 * 60, unit: 'min', label: 'Max input length', response: 'block' },
    ],
    watermarkFree: true,
    proValueProp: ['Unlimited daily', 'No length limit', 'No watermark'],
  },
  {
    key: 'video-trim', displayName: 'Video Trim', tier: 'top-of-funnel',
    levers: [
      { type: 'count-day', free: 5, label: 'Daily trims', response: 'block' },
      { type: 'input-size', free: 200 * 1024 * 1024, unit: 'MB', label: 'Max input', response: 'block' },
      { type: 'input-duration', free: 10 * 60, unit: 'min', label: 'Max input length', response: 'block' },
    ],
    watermarkFree: true,
    proValueProp: ['Unlimited trims', 'No length limit', 'No watermark'],
  },
  {
    key: 'video-merge', displayName: 'Video Merge', tier: 'standard',
    levers: [
      { type: 'count-day', free: 2, label: 'Daily merges', response: 'block' },
      { type: 'batch', free: 5, pro: 100, label: 'Clips per merge', response: 'block' },
      { type: 'input-duration', free: 5 * 60, unit: 'min', label: 'Total length', response: 'block' },
    ],
    watermarkFree: true,
    proValueProp: ['Unlimited merges', '100 clips per merge', 'No length limit', 'No watermark'],
  },
  {
    key: 'video-to-gif', displayName: 'Video → GIF', tier: 'top-of-funnel',
    levers: [
      { type: 'count-day', free: 3, label: 'Daily exports', response: 'block' },
      { type: 'input-duration', free: 30, unit: 'sec', label: 'Source duration', response: 'block' },
      { type: 'output-resolution', free: 480, pro: 1080, unit: 'p', label: 'Output size', response: 'degrade' },
    ],
    watermarkFree: true,
    proValueProp: ['Unlimited daily', 'Up to 1080p', '5 min clips', 'No watermark'],
  },
  {
    key: 'video-screen-record', displayName: 'Screen Record', tier: 'standard',
    levers: [
      { type: 'count-day', free: 2, label: 'Daily recordings', response: 'block' },
      { type: 'recording-minutes', free: 5, pro: 8 * 60, unit: 'min', label: 'Max recording length', response: 'block' },
    ],
    watermarkFree: true,
    proValueProp: ['Unlimited recordings', '8h length cap', 'No watermark'],
  },
  {
    key: 'video-webcam-record', displayName: 'Webcam Record', tier: 'standard',
    levers: [
      { type: 'count-day', free: 2, label: 'Daily recordings', response: 'block' },
      { type: 'recording-minutes', free: 5, pro: 8 * 60, unit: 'min', label: 'Max recording length', response: 'block' },
    ],
    watermarkFree: true,
    proValueProp: ['Unlimited recordings', '8h length', 'No watermark'],
  },
  {
    key: 'video-auto-subtitle', displayName: 'Auto Subtitles', tier: 'sample-only',
    levers: [
      { type: 'count-day', free: 2, label: 'Daily exports', response: 'block' },
      { type: 'input-duration', free: 5 * 60, unit: 'min', label: 'Max video length', response: 'block' },
      { type: 'ai-minutes-day', free: 5, pro: 240, unit: 'min', label: 'Daily AI minutes', response: 'block' },
    ],
    watermarkFree: true,
    proValueProp: ['4h AI captions/day', 'No length cap', 'Larger model', 'No watermark'],
  },
  {
    key: 'video-auto-dub', displayName: 'Auto Dub (AI)', tier: 'sample-only',
    levers: [
      { type: 'count-day', free: 1, label: 'Daily dubs', response: 'block' },
      { type: 'input-duration', free: 2 * 60, unit: 'min', label: 'Max video length', response: 'block' },
      { type: 'ai-minutes-day', free: 5, pro: 120, unit: 'min', label: 'Daily AI minutes', response: 'block' },
    ],
    watermarkFree: true,
    proValueProp: ['Unlimited dubs', '2h AI minutes daily', 'Larger voice models', 'No watermark'],
  },
  {
    key: 'video-to-shorts', displayName: 'Long → Shorts', tier: 'standard',
    levers: [
      { type: 'count-day', free: 2, label: 'Daily exports', response: 'block' },
      { type: 'input-duration', free: 10 * 60, unit: 'min', label: 'Max input length', response: 'block' },
    ],
    watermarkFree: true,
    proValueProp: ['Unlimited exports', '2h inputs', 'No watermark'],
  },
  {
    key: 'video-reframe', displayName: 'Smart Reframe', tier: 'standard',
    levers: [
      { type: 'count-day', free: 2, label: 'Daily exports', response: 'block' },
      { type: 'input-duration', free: 5 * 60, unit: 'min', label: 'Max length', response: 'block' },
    ],
    watermarkFree: true,
    proValueProp: ['Unlimited exports', 'No length cap', 'No watermark'],
  },

  // ---- Audio: AI / heavy ----
  {
    key: 'audio-to-text', displayName: 'Audio Transcribe (AI)', tier: 'standard',
    levers: [
      { type: 'count-day', free: 2, label: 'Daily transcripts', response: 'block' },
      { type: 'input-size', free: 30 * 1024 * 1024, unit: 'MB', label: 'Max input size', response: 'block' },
      { type: 'input-duration', free: 5 * 60, unit: 'min', label: 'Max audio length', response: 'block' },
      { type: 'ai-minutes-day', free: 10, pro: 240, unit: 'min', label: 'Daily AI minutes', response: 'block' },
    ],
    watermarkFree: false,
    proValueProp: ['4h transcription/day', 'No length cap', 'Larger Whisper model', 'Speaker diarization'],
  },
  {
    key: 'audio-text-to-speech', displayName: 'Text → Speech', tier: 'standard',
    levers: [
      { type: 'count-day', free: 3, label: 'Daily generations', response: 'block' },
      { type: 'ai-minutes-day', free: 5, pro: 120, unit: 'min', label: 'Daily TTS minutes', response: 'block' },
      { type: 'formats', free: 0, label: 'Free formats', response: 'block', freeFormats: ['mp3'] },
    ],
    watermarkFree: false,
    proValueProp: ['2h TTS daily', 'WAV / FLAC export', 'Premium voices'],
  },
  {
    key: 'audio-vocal-remover', displayName: 'Vocal Remover (AI)', tier: 'sample-only',
    levers: [
      { type: 'count-day', free: 2, label: 'Daily separations', response: 'block' },
      { type: 'input-size', free: 30 * 1024 * 1024, unit: 'MB', label: 'Max input size', response: 'block' },
      { type: 'input-duration', free: 5 * 60, unit: 'min', label: 'Max length', response: 'block' },
    ],
    watermarkFree: true,
    proValueProp: ['Unlimited separations', 'No length cap', 'Higher-quality model', 'No watermark'],
  },
  {
    key: 'audio-remove-noise', displayName: 'Audio Denoise (AI)', tier: 'standard',
    levers: [
      { type: 'count-day', free: 2, label: 'Daily denoises', response: 'block' },
      { type: 'input-size', free: 30 * 1024 * 1024, unit: 'MB', label: 'Max input size', response: 'block' },
      { type: 'input-duration', free: 10 * 60, unit: 'min', label: 'Max length', response: 'block' },
    ],
    watermarkFree: false,
    proValueProp: ['Unlimited daily', 'No length cap', 'Larger model'],
  },
  {
    key: 'audio-merge', displayName: 'Audio Merge', tier: 'top-of-funnel',
    levers: [
      { type: 'count-day', free: 3, label: 'Daily merges', response: 'block' },
      { type: 'batch', free: 10, pro: 100, label: 'Clips per merge', response: 'block' },
    ],
    watermarkFree: false,
    proValueProp: ['Unlimited daily', '100 clips per merge'],
  },
  {
    key: 'audio-convert-format', displayName: 'Audio Convert', tier: 'top-of-funnel',
    levers: [
      { type: 'count-day', free: 5, label: 'Daily conversions', response: 'block' },
      { type: 'input-size', free: 50 * 1024 * 1024, unit: 'MB', label: 'Max input size', response: 'block' },
      { type: 'output-bitrate', free: 192, pro: 320, unit: 'kbps', label: 'Max output bitrate', response: 'degrade' },
      { type: 'formats', free: 0, label: 'Free formats', response: 'block', freeFormats: ['mp3', 'wav', 'ogg'] },
    ],
    watermarkFree: false,
    proValueProp: ['Unlimited daily', '320 kbps', 'FLAC / OPUS / M4A'],
  },

  // ---- PDF: heavy ----
  {
    key: 'pdf-ocr', displayName: 'PDF OCR', tier: 'standard',
    levers: [
      { type: 'count-day', free: 2, label: 'Daily OCR runs', response: 'block' },
      { type: 'input-size', free: 20 * 1024 * 1024, unit: 'MB', label: 'Max input size', response: 'block' },
      { type: 'pages', free: 30, unit: 'pages', label: 'Max pages', response: 'block' },
      { type: 'ai-minutes-day', free: 10, pro: 240, unit: 'min', label: 'Daily OCR minutes', response: 'block' },
    ],
    watermarkFree: true,
    proValueProp: ['Unlimited pages', '4h OCR daily', 'All languages', 'No watermark'],
  },
  {
    key: 'pdf-merge', displayName: 'PDF Merge', tier: 'top-of-funnel',
    levers: [
      { type: 'count-day', free: 3, label: 'Daily merges', response: 'block' },
      { type: 'batch', free: 10, pro: 100, label: 'PDFs per merge', response: 'block' },
      { type: 'input-size', free: 25 * 1024 * 1024, unit: 'MB', label: 'Max per file', response: 'block' },
    ],
    watermarkFree: false,
    proValueProp: ['Unlimited daily', '100 PDFs per merge', '500 MB inputs'],
  },
  {
    key: 'pdf-sign', displayName: 'PDF Sign', tier: 'standard',
    levers: [
      { type: 'count-day', free: 2, label: 'Daily signs', response: 'block' },
      { type: 'input-size', free: 20 * 1024 * 1024, unit: 'MB', label: 'Max input', response: 'block' },
    ],
    watermarkFree: false,
    proValueProp: ['Unlimited signs', 'Audit trail', '500 MB inputs'],
  },
  {
    key: 'pdf-compress', displayName: 'PDF Compress', tier: 'top-of-funnel',
    levers: [
      { type: 'count-day', free: 3, label: 'Daily compresses', response: 'block' },
      { type: 'input-size', free: 30 * 1024 * 1024, unit: 'MB', label: 'Max input', response: 'block' },
    ],
    watermarkFree: false,
    proValueProp: ['Unlimited daily', '500 MB inputs'],
  },

  // ---- Subtitle: AI ----
  {
    key: 'subtitle-generate', displayName: 'Generate subtitles', tier: 'standard',
    levers: [
      { type: 'count-day', free: 2, label: 'Daily generations', response: 'block' },
      { type: 'input-duration', free: 5 * 60, unit: 'min', label: 'Max input length', response: 'block' },
      { type: 'ai-minutes-day', free: 5, pro: 240, unit: 'min', label: 'Daily AI minutes', response: 'block' },
    ],
    watermarkFree: false,
    proValueProp: ['4h AI captions/day', 'No length cap', 'Higher accuracy'],
  },

  // ---- Translation ----
  {
    key: 'doc-translate', displayName: 'Document Translate', tier: 'standard',
    levers: [
      { type: 'count-day', free: 2, label: 'Daily translations', response: 'block' },
      { type: 'input-size', free: 10 * 1024 * 1024, unit: 'MB', label: 'Max input size', response: 'block' },
      { type: 'pages', free: 20, unit: 'pages', label: 'Max pages', response: 'block' },
      { type: 'ai-minutes-day', free: 5, pro: 120, unit: 'min', label: 'Daily AI minutes', response: 'block' },
    ],
    watermarkFree: true,
    proValueProp: ['Unlimited pages', '2h AI daily', 'No watermark'],
  },
  {
    key: 'text-translate', displayName: 'Text Translate', tier: 'top-of-funnel',
    levers: [
      { type: 'count-day', free: 10, label: 'Daily translations', response: 'block' },
      { type: 'ai-minutes-day', free: 10, pro: 240, unit: 'min', label: 'Daily AI minutes', response: 'block' },
    ],
    watermarkFree: false,
    proValueProp: ['Unlimited daily', '4h AI minutes', 'Better model'],
  },
  {
    key: 'translate-studio', displayName: 'Translation Studio', tier: 'sample-only',
    levers: [
      { type: 'count-day', free: 3, label: 'Daily exports', response: 'block' },
      { type: 'ai-minutes-day', free: 10, pro: 240, unit: 'min', label: 'Daily AI minutes', response: 'block' },
      { type: 'pages', free: 20, unit: 'pages', label: 'Max document size', response: 'block' },
    ],
    watermarkFree: true,
    proValueProp: ['4h daily AI', 'Unlimited pages', 'Premium models', 'No watermark'],
  },

  // ---- Studio-class creators (already in policy as STUDIO_POLICIES use sample-only; these are lighter creators) ----
  {
    key: 'studio-resume', displayName: 'Resume Studio', tier: 'standard',
    levers: [
      { type: 'count-day', free: 2, label: 'Daily exports', response: 'block' },
      { type: 'project-saves', free: 3, label: 'Saved resumes', response: 'block' },
      { type: 'formats', free: 0, label: 'Free formats', response: 'block', freeFormats: ['pdf'] },
    ],
    watermarkFree: true,
    proValueProp: ['Unlimited exports', 'DOCX export', 'Unlimited saved', 'No watermark', 'All templates'],
  },
  {
    key: 'studio-invoice', displayName: 'Invoice Studio', tier: 'standard',
    levers: [
      { type: 'count-day', free: 2, label: 'Daily invoices', response: 'block' },
      { type: 'project-saves', free: 5, label: 'Saved invoices', response: 'block' },
    ],
    watermarkFree: true,
    proValueProp: ['Unlimited invoices', 'Recurring invoices', 'Unlimited saves', 'No watermark'],
  },
  {
    key: 'studio-chart', displayName: 'Chart Studio', tier: 'standard',
    levers: [
      { type: 'count-day', free: 4, label: 'Daily exports', response: 'block' },
      { type: 'rows', free: 200, pro: 100_000, label: 'Max rows', response: 'block' },
    ],
    watermarkFree: true,
    proValueProp: ['Unlimited exports', '100K data rows', 'Premium chart types', 'No watermark'],
  },
  {
    key: 'studio-diagram', displayName: 'Diagram Studio', tier: 'standard',
    levers: [
      { type: 'count-day', free: 4, label: 'Daily exports', response: 'block' },
      { type: 'project-saves', free: 5, label: 'Saved diagrams', response: 'block' },
    ],
    watermarkFree: true,
    proValueProp: ['Unlimited exports', 'Unlimited saves', 'Premium templates', 'No watermark'],
  },
];

// =============================================================================
// APPS — P2P live tools. Gates run BEFORE the session starts; we never cut a
// live call/transfer mid-stream.
// =============================================================================

const APP_POLICIES: ToolPolicy[] = [
  {
    key: 'call', displayName: 'Call Studio', tier: 'standard',
    levers: [
      { type: 'count-day', free: 3, label: 'Hosted calls / day', response: 'block' },
      { type: 'participants', free: 3, pro: 8, label: 'Max participants', response: 'block' },
      { type: 'session-minutes', free: 40, pro: 24 * 60, unit: 'min', label: 'Max call length', response: 'block' },
      { type: 'recording-minutes', free: 5, pro: 8 * 60, unit: 'min', label: 'Max recording length', response: 'block' },
      { type: 'ai-minutes-day', free: 10, pro: 240, unit: 'min', label: 'Daily live captions', response: 'block' },
    ],
    watermarkFree: true,
    proValueProp: [
      'Up to 8 people per call (vs 3)',
      'Unlimited call length (vs 40 min)',
      '8h recordings (vs 5 min)',
      '4h of live captions daily',
      'No recording watermark',
    ],
  },
  {
    key: 'chat', displayName: 'Chat Studio', tier: 'top-of-funnel',
    levers: [
      { type: 'participants', free: 3, pro: 50, label: 'Members per room', response: 'block' },
      { type: 'input-size', free: 50 * 1024 * 1024, unit: 'MB', label: 'Max file send', response: 'block' },
      { type: 'history-days', free: 14, pro: 365, unit: 'days', label: 'Message history', response: 'block' },
      { type: 'ai-minutes-day', free: 5, pro: 120, unit: 'min', label: 'AI minutes (summarize/translate)', response: 'block' },
    ],
    watermarkFree: false,
    proValueProp: [
      'Up to 50 members per room (vs 3)',
      '5 GB file send (vs 50 MB)',
      '365-day history (vs 14)',
      'Unlimited AI summarize / translate',
    ],
  },
  {
    key: 'watch', displayName: 'Watch Studio', tier: 'standard',
    levers: [
      { type: 'count-day', free: 3, label: 'Hosted sessions / day', response: 'block' },
      { type: 'participants', free: 3, pro: 50, label: 'Viewers', response: 'block' },
      { type: 'session-minutes', free: 30, pro: 12 * 60, unit: 'min', label: 'Session length', response: 'block' },
      { type: 'output-resolution', free: 720, pro: 1080, unit: 'p', label: 'Stream resolution', response: 'degrade' },
    ],
    watermarkFree: true,
    proValueProp: [
      'Up to 50 viewers (vs 3)',
      '12-hour sessions (vs 30 min)',
      '1080p streaming',
      'No watermark on shared stream',
    ],
  },
  {
    key: 'send', displayName: 'Send', tier: 'top-of-funnel',
    levers: [
      { type: 'count-day', free: 5, label: 'Transfers / day', response: 'block' },
      { type: 'input-size', free: 2 * 1024 * 1024 * 1024, unit: 'GB', label: 'Max file size', response: 'block' },
    ],
    watermarkFree: false,
    proValueProp: ['Unlimited transfers', '20 GB per file'],
  },
];

// =============================================================================
// API
// =============================================================================

const ALL_POLICIES: ToolPolicy[] = [...CATEGORY_POLICIES, ...STUDIO_POLICIES, ...HEAVY_TOOL_POLICIES, ...APP_POLICIES];

const POLICY_MAP = new Map<string, ToolPolicy>(ALL_POLICIES.map((p) => [p.key, p]));

export function getPolicy(key: string): ToolPolicy | undefined {
  return POLICY_MAP.get(key);
}

export function getAllPolicies(): ToolPolicy[] {
  return ALL_POLICIES;
}

/**
 * DEV GUARD: count-day in this file is dead code (config.ts is the runtime count
 * authority). This warns in development if anyone re-introduces a count-day value
 * here that diverges from config, so the "designed a tier that never runs" bug
 * class can't silently return. No-op in production.
 */
if (process.env.NODE_ENV !== 'production') {
  // Lazy import to avoid a hard dependency cycle at module load.
  void (async () => {
    try {
      const { limitForKey, isGatedKey } = await import('@/lib/usage/config');
      for (const p of ALL_POLICIES) {
        const cd = p.levers.find((l) => l.type === 'count-day');
        if (!cd) continue;
        if (!isGatedKey(p.key)) continue; // not metered for count at all → policy number is moot
        const real = limitForKey(p.key);
        if (Number.isFinite(real) && real < 9999 && real !== cd.free) {
          // eslint-disable-next-line no-console
          console.warn(`[policy] count-day for "${p.key}" is ${cd.free} but the runtime count (config.ts) is ${real}. count-day here is DEAD; edit config.ts.`);
        }
      }
    } catch { /* ignore in environments without the config module */ }
  })();
}

export interface LimitHit {
  key: string;
  policy: ToolPolicy;
  lever: Lever;
  observed: number;
  upgradeTo: 'pro';
  friendly: string;
}

/** Check ONE lever against an observed value. Returns null if OK. */
export function checkLever(key: string, type: LeverType, value: number, isPro: boolean): LimitHit | null {
  if (isPro) return null;
  const policy = POLICY_MAP.get(key);
  if (!policy) return null;
  const lever = policy.levers.find((l) => l.type === type);
  if (!lever) return null;
  if (value <= lever.free) return null;
  return {
    key,
    policy,
    lever,
    observed: value,
    upgradeTo: 'pro',
    friendly: friendlyFor(lever, value, policy),
  };
}

/** Check the FORMAT lever for an output format string. */
export function checkFormat(key: string, format: string, isPro: boolean): LimitHit | null {
  if (isPro) return null;
  const policy = POLICY_MAP.get(key);
  if (!policy) return null;
  const lever = policy.levers.find((l) => l.type === 'formats');
  if (!lever || !lever.freeFormats) return null;
  if (lever.freeFormats.includes(format.toLowerCase())) return null;
  return {
    key,
    policy,
    lever,
    observed: 0,
    upgradeTo: 'pro',
    friendly: `${format.toUpperCase()} export is a Pro format. Free formats: ${lever.freeFormats.map((f) => f.toUpperCase()).join(', ')}.`,
  };
}

/** Get a specific lever object (for inline ProBadge / input max attributes). */
export function getLever(key: string, type: LeverType): Lever | undefined {
  return POLICY_MAP.get(key)?.levers.find((l) => l.type === type);
}

/** Free cap value for a lever, or Infinity if not gated for this tool. */
export function freeCap(key: string, type: LeverType): number {
  return POLICY_MAP.get(key)?.levers.find((l) => l.type === type)?.free ?? Infinity;
}

function friendlyFor(lever: Lever, value: number, policy: ToolPolicy): string {
  const unit = lever.unit ? ` ${lever.unit}` : '';
  switch (lever.type) {
    case 'count-day':
      return `Free plan allows ${lever.free} ${policy.displayName.toLowerCase()} exports per day. You've used all of them.`;
    case 'input-size':
      return `File is too large for the free plan. Free max: ${(lever.free / (1024 * 1024)).toFixed(0)} MB.`;
    case 'input-duration':
      return `Your input is ${Math.round(value)}${unit} — free plan max is ${lever.free}${unit}.`;
    case 'output-resolution':
      return `Free exports cap at ${lever.free}p. Choose ${lever.free}p or lower, or go Pro for ${lever.pro}p.`;
    case 'output-bitrate':
      return `Free export bitrate is ${lever.free} kbps. Pro unlocks ${lever.pro} kbps.`;
    case 'output-fps':
      return `Free FPS cap is ${lever.free}. Pro unlocks ${lever.pro} fps.`;
    case 'pages':
      return `Free plan caps at ${lever.free} ${lever.unit ?? 'pages'}; your document has ${value}.`;
    case 'rows':
      return `Free plan caps at ${lever.free} rows.`;
    case 'tracks':
      return `Free plan allows ${lever.free} tracks. Pro: ${lever.pro}.`;
    case 'layers':
      return `Free plan allows ${lever.free} layers. Pro: ${lever.pro}.`;
    case 'batch':
      return `Free batch limit is ${lever.free} files; you selected ${value}.`;
    case 'participants':
      return `Free plan allows ${lever.free} people. Pro: ${lever.pro}.`;
    case 'session-minutes':
      return `Free sessions are capped at ${lever.free} min. Pro: ${lever.pro === 24 * 60 ? 'unlimited' : `${lever.pro} min`}.`;
    case 'recording-minutes':
      return `Free recordings cap at ${lever.free} min. Pro: ${lever.pro} min.`;
    case 'ai-minutes-day':
      return `Free plan: ${lever.free} AI minutes/day. Pro: ${lever.pro} min/day.`;
    case 'project-saves':
      return `Free library holds ${lever.free} projects. Pro: unlimited.`;
    case 'history-days':
      return `Free history is ${lever.free} days. Pro: ${lever.pro} days.`;
    case 'formats':
      return `That output format is Pro only.`;
  }
}
