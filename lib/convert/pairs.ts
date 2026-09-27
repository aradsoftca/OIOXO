/**
 * Convert path registry.
 *
 * Each ConvertPair maps a `from`→`to` slug to an existing tool that performs
 * (or substantially performs) that conversion. Pairs become static pages at
 * /convert/{from}-to-{to} for SEO and direct entry.
 *
 * Adding a pair:
 *   1. Make sure the underlying tool handles both input and output formats.
 *   2. Add an entry below. The slug is `${from}-to-${to}` (lowercase).
 *   3. Optionally override `title`, `blurb` for more specific copy.
 */
import { CAD3D_PAIRS } from '@/lib/convert/cad3d';
import type { Category } from '@/lib/registry/types';

export interface ConvertPair {
  from: string;
  to: string;
  /** Existing tool that handles this pair */
  toolId: string;
  category: Category;
  /** Optional override; defaults to "{FROM} → {TO}" */
  title?: string;
  /** Optional 1-liner override */
  blurb?: string;
  /** Optional note shown on the page (e.g. "Output is WebM Opus") */
  note?: string;
  /** Mark as commonly searched — used to surface on the hub */
  popular?: boolean;
}

const upper = (s: string): string => s.toUpperCase();
const lower = (s: string): string => s.toLowerCase();

const IMAGE_FORMATS = ['png', 'jpg', 'webp', 'avif'] as const;
const IMAGE_INPUT_ONLY = ['gif', 'bmp', 'svg'] as const;
const AUDIO_FORMATS = ['mp3', 'wav'] as const;
const AUDIO_INPUT_ONLY = ['m4a', 'aac', 'ogg', 'flac', 'opus'] as const;
const VIDEO_INPUTS = ['mp4', 'webm', 'mov', 'mkv', 'avi'] as const;

function buildImagePairs(): ConvertPair[] {
  const out: ConvertPair[] = [];
  for (const from of IMAGE_FORMATS) {
    for (const to of IMAGE_FORMATS) {
      if (from === to) continue;
      out.push({
        from: lower(from), to: lower(to), toolId: 'image-convert-format', category: 'image',
        popular: (from === 'png' && to === 'jpg') || (from === 'webp' && to === 'jpg') || (from === 'jpg' && to === 'webp'),
      });
    }
  }
  for (const from of IMAGE_INPUT_ONLY) {
    for (const to of IMAGE_FORMATS) {
      out.push({
        from, to: lower(to), toolId: 'image-convert-format', category: 'image',
        popular: from === 'svg' && to === 'png',
      });
    }
  }
  return out;
}

function buildAudioPairs(): ConvertPair[] {
  const out: ConvertPair[] = [];
  for (const from of AUDIO_FORMATS) {
    for (const to of AUDIO_FORMATS) {
      if (from === to) continue;
      out.push({
        from, to, toolId: 'audio-convert-format', category: 'audio',
        popular: true,
      });
    }
  }
  for (const from of AUDIO_INPUT_ONLY) {
    for (const to of AUDIO_FORMATS) {
      out.push({ from, to, toolId: 'audio-convert-format', category: 'audio' });
    }
  }
  return out;
}

function buildVideoPairs(): ConvertPair[] {
  const out: ConvertPair[] = [];
  // Video → GIF
  for (const from of VIDEO_INPUTS) {
    out.push({
      from, to: 'gif', toolId: 'video-to-gif', category: 'video',
      blurb: `Turn a ${upper(from)} clip into an animated GIF — pick the range, frame rate and size.`,
      popular: from === 'mp4',
    });
  }
  // Video → Audio (extract). Until ffmpeg.wasm lands, output is WebM/Opus — note it.
  for (const from of VIDEO_INPUTS) {
    out.push({
      from, to: 'audio', toolId: 'video-extract-audio', category: 'video',
      title: `${upper(from)} → Audio`,
      blurb: `Pull just the audio track from a ${upper(from)} file.`,
      note: 'Audio is exported as WebM/Opus. To get MP3, follow up with Audio → Convert Format.',
      popular: from === 'mp4',
    });
  }
  return out;
}

// Video format conversion, backed by video-convert-format (ffmpeg.wasm).
// Inputs are anything ffmpeg decodes; outputs are what the tool advertises (mp4/webm).
const VIDEO_CONVERT_INPUTS = ['mp4', 'webm', 'mov', 'mkv', 'avi', 'flv', 'm4v', 'wmv', '3gp', 'mpg', 'ts'] as const;
const VIDEO_CONVERT_OUTPUTS = ['mp4', 'webm'] as const;

function buildVideoConvertPairs(): ConvertPair[] {
  const out: ConvertPair[] = [];
  for (const from of VIDEO_CONVERT_INPUTS) {
    for (const to of VIDEO_CONVERT_OUTPUTS) {
      if (from === to) continue;
      out.push({
        from, to, toolId: 'video-convert-format', category: 'video',
        title: `${upper(from)} → ${upper(to)}`,
        blurb: `Convert ${upper(from)} video to ${upper(to)} — runs on your device, files stay yours.`,
        popular: (from === 'mov' && to === 'mp4') || (from === 'mp4' && to === 'webm') || (from === 'avi' && to === 'mp4') || (from === 'mkv' && to === 'mp4'),
      });
    }
  }
  return out;
}

// PDF ↔ image + PDF → text, backed by real tools shipped in waves 11/17/18.
function buildPdfPairs(): ConvertPair[] {
  const out: ConvertPair[] = [];
  // PDF → image (rasterize each page)
  for (const to of ['jpg', 'png', 'webp'] as const) {
    out.push({
      from: 'pdf', to, toolId: 'pdf-to-images', category: 'pdf',
      title: `PDF → ${upper(to)}`,
      blurb: `Turn every page of a PDF into ${upper(to)} images — download them as a ZIP.`,
      popular: to === 'jpg',
    });
  }
  // image → PDF (combine into one document)
  for (const from of ['jpg', 'png', 'webp'] as const) {
    out.push({
      from, to: 'pdf', toolId: 'images-to-pdf', category: 'pdf',
      title: `${upper(from)} → PDF`,
      blurb: `Combine ${upper(from)} images into a single PDF — reorder before you save.`,
      popular: from === 'jpg',
    });
  }
  // PDF → text (existing text layer)
  out.push({
    from: 'pdf', to: 'txt', toolId: 'pdf-to-text', category: 'pdf',
    title: 'PDF → Text',
    blurb: 'Pull the selectable text out of a PDF as plain text.',
    popular: true,
  });
  return out;
}

// Image → text (OCR) and audio → text (transcription), backed by browser AI tools.
function buildTextExtractPairs(): ConvertPair[] {
  const out: ConvertPair[] = [];
  for (const from of ['jpg', 'png', 'webp', 'gif', 'bmp'] as const) {
    out.push({
      from, to: 'txt', toolId: 'image-ocr', category: 'image',
      title: `${upper(from)} → Text`,
      blurb: `Read the text inside a ${upper(from)} image — 20 languages, on your device.`,
      popular: from === 'jpg' || from === 'png',
    });
  }
  for (const from of ['mp3', 'wav', 'm4a', 'ogg', 'flac'] as const) {
    out.push({
      from, to: 'txt', toolId: 'audio-to-text', category: 'audio',
      title: `${upper(from)} → Text`,
      blurb: `Transcribe a ${upper(from)} recording into text with timestamps.`,
      popular: from === 'mp3',
    });
  }
  return out;
}

// Still image(s) → MP4, backed by images-to-video (ffmpeg.wasm slideshow).
function buildImageVideoPairs(): ConvertPair[] {
  return (['bmp', 'jpg', 'png', 'webp', 'gif'] as const).map((from) => ({
    from, to: 'mp4', toolId: 'images-to-video', category: 'video' as const,
    title: `${upper(from)} → MP4`,
    blurb: `Turn a ${upper(from)} image — or a whole set — into an MP4 video, right in your browser.`,
    popular: from === 'jpg' || from === 'png',
  }));
}

const BASE_PAIRS: ConvertPair[] = [
  ...buildImagePairs(),
  ...buildAudioPairs(),
  ...buildVideoPairs(),
  ...buildVideoConvertPairs(),
  ...buildImageVideoPairs(),
  ...buildPdfPairs(),
  ...buildTextExtractPairs(),
];

// CAD & 3D flagship pairs (lib/convert/cad3d.ts) — hand-written, engine-verified.
export const CONVERT_PAIRS: ConvertPair[] = [
  ...BASE_PAIRS,
  ...CAD3D_PAIRS.filter((c) => !BASE_PAIRS.some((b) => b.from === c.from && b.to === c.to)),
];

export const CONVERT_PAIRS_BY_SLUG = new Map(
  CONVERT_PAIRS.map((p) => [`${p.from}-to-${p.to}`, p]),
);

export function getPair(slug: string): ConvertPair | undefined {
  return CONVERT_PAIRS_BY_SLUG.get(slug);
}

export function pairsByCategory(category: Category): ConvertPair[] {
  return CONVERT_PAIRS.filter((p) => p.category === category);
}

export function popularPairs(limit = 12): ConvertPair[] {
  return CONVERT_PAIRS.filter((p) => p.popular).slice(0, limit);
}

export function pairTitle(p: ConvertPair): string {
  if (p.title) return p.title;
  return `${upper(p.from)} → ${upper(p.to)}`;
}

export function pairBlurb(p: ConvertPair): string {
  if (p.blurb) return p.blurb;
  return `Convert ${upper(p.from)} files to ${upper(p.to)} — files stay yours.`;
}
