/**
 * Intent classifier — routes a dropped file or a typed phrase to the tools
 * that can act on it. Pure logic, no LLM: file kind comes from MIME +
 * extension, query matching is weighted token scoring over the registry.
 */
import { TOOLS } from '@/lib/registry';
import type { ToolManifest, Category } from '@/lib/registry/types';

export type FileKind = 'image' | 'audio' | 'video' | 'pdf' | 'font' | 'text' | 'unknown';

export interface FileLike {
  name: string;
  type: string;
  size?: number;
}

export interface ToolSuggestion {
  tool: ToolManifest;
  score: number;
  /** Short reason shown to the user, e.g. "Compress" or "matches \"smaller\"". */
  reason?: string;
}

const EXT_KIND: Record<string, FileKind> = {
  // image
  jpg: 'image', jpeg: 'image', png: 'image', webp: 'image', avif: 'image',
  gif: 'image', bmp: 'image', tif: 'image', tiff: 'image', svg: 'image',
  heic: 'image', ico: 'image',
  // audio
  mp3: 'audio', wav: 'audio', m4a: 'audio', aac: 'audio', ogg: 'audio',
  flac: 'audio', opus: 'audio', weba: 'audio',
  // video
  mp4: 'video', webm: 'video', mov: 'video', mkv: 'video', avi: 'video',
  m4v: 'video', mpg: 'video', mpeg: 'video',
  // pdf
  pdf: 'pdf',
  // font
  ttf: 'font', otf: 'font', woff: 'font', woff2: 'font',
  // text
  txt: 'text', md: 'text', csv: 'text', json: 'text', xml: 'text',
  yaml: 'text', yml: 'text', srt: 'text', vtt: 'text', html: 'text', css: 'text',
};

export function extOf(name: string): string {
  const m = name.toLowerCase().match(/\.([a-z0-9]+)$/);
  return m ? m[1] : '';
}

export function detectKind(file: FileLike): FileKind {
  const type = (file.type || '').toLowerCase();
  if (type.startsWith('image/')) return 'image';
  if (type.startsWith('audio/')) return 'audio';
  if (type.startsWith('video/')) return 'video';
  if (type === 'application/pdf') return 'pdf';
  if (type.startsWith('font/') || type.includes('font')) return 'font';
  if (type.startsWith('text/') || type.includes('json') || type.includes('xml')) return 'text';
  const kind = EXT_KIND[extOf(file.name)];
  return kind ?? 'unknown';
}

// Category that a file kind maps to in the registry.
const KIND_TO_CATEGORY: Record<FileKind, Category | null> = {
  image: 'image', audio: 'audio', video: 'video', pdf: 'pdf',
  font: 'font', text: 'text', unknown: null,
};

// Per-kind ordering: the tools people most often reach for, by id.
const KIND_PRIORITY: Record<FileKind, string[]> = {
  image: ['image-convert-format', 'image-compress', 'image-resize', 'image-remove-bg', 'image-crop', 'image-upscale', 'image-ocr', 'image-rotate', 'image-watermark'],
  audio: ['audio-convert-format', 'audio-to-text', 'audio-trim', 'audio-volume', 'audio-compress', 'audio-merge', 'audio-remove-noise'],
  video: ['video-convert-format', 'video-compress', 'video-to-gif', 'video-trim', 'video-resize', 'video-extract-audio', 'video-mute'],
  pdf:   ['pdf-compress', 'pdf-to-images', 'pdf-to-text', 'pdf-merge', 'pdf-split', 'pdf-protect', 'pdf-ocr'],
  font:  ['font-convert', 'font-preview', 'font-subset', 'font-inspect'],
  text:  ['text-word-counter', 'dev-json-format', 'subtitle-cleaner', 'text-find-replace'],
  unknown: [],
};

function accepts(tool: ToolManifest, file: FileLike): boolean {
  if (!tool.accepts || tool.accepts.length === 0) return false;
  const type = (file.type || '').toLowerCase();
  const ext = extOf(file.name);
  return tool.accepts.some((a) => {
    const al = a.toLowerCase();
    if (type && al === type) return true;
    if (al.endsWith('/*') && type.startsWith(al.slice(0, -1))) return true;
    // Some manifests list bare extensions or partial mimes.
    if (ext && al.includes(ext)) return true;
    return false;
  });
}

/**
 * Rank tools that can act on a dropped file. Returns up to `limit` matches,
 * curated-priority first, then any other accepting tool in the same category.
 */
export function suggestForFile(file: FileLike, limit = 12): { kind: FileKind; suggestions: ToolSuggestion[] } {
  const kind = detectKind(file);
  const category = KIND_TO_CATEGORY[kind];
  if (!category) return { kind, suggestions: [] };

  const inCategory = TOOLS.filter((t) => t.category === category);
  const priority = KIND_PRIORITY[kind];

  const scored: ToolSuggestion[] = inCategory.map((tool) => {
    const pIdx = priority.indexOf(tool.id);
    const acceptsFile = accepts(tool, file);
    let score = 0;
    if (acceptsFile) score += 50;
    if (pIdx >= 0) score += 100 - pIdx * 5;
    if (tool.pinDefault) score += 8;
    return { tool, score };
  });

  return {
    kind,
    suggestions: scored
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit),
  };
}

// Verb/synonym hints → boost tools whose id/keywords contain the target token.
const INTENT_HINTS: { match: RegExp; tokens: string[] }[] = [
  { match: /\b(smaller|shrink|reduce|compress|optimi[sz]e)\b/, tokens: ['compress'] },
  { match: /\b(convert|change format|turn into|to png|to jpg|to mp3|to mp4)\b/, tokens: ['convert'] },
  { match: /\b(transcribe|subtitle|caption|speech to text|to text)\b/, tokens: ['transcribe', 'text', 'subtitle'] },
  { match: /\b(remove background|cut out|cutout|transparent)\b/, tokens: ['background', 'remove'] },
  { match: /\b(resize|scale|dimensions)\b/, tokens: ['resize'] },
  { match: /\b(upscale|enlarge|enhance|sharpen)\b/, tokens: ['upscale'] },
  { match: /\b(merge|combine|join)\b/, tokens: ['merge'] },
  { match: /\b(split|cut|trim)\b/, tokens: ['split', 'trim'] },
  { match: /\b(password|protect|encrypt|lock)\b/, tokens: ['protect'] },
  { match: /\b(qr|barcode)\b/, tokens: ['qr', 'barcode'] },
  { match: /\b(read text|ocr|scan)\b/, tokens: ['ocr', 'text'] },
];

function tokenize(s: string): string[] {
  return s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 1);
}

/**
 * Rank tools for a free-text query. Weighted token scoring over name, id,
 * keywords, and blurb, plus verb-synonym boosts.
 */
export function suggestForQuery(query: string, limit = 8): ToolSuggestion[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const words = tokenize(q);
  const boostTokens = new Set<string>();
  for (const hint of INTENT_HINTS) {
    if (hint.match.test(q)) hint.tokens.forEach((t) => boostTokens.add(t));
  }

  const scored: ToolSuggestion[] = TOOLS.map((tool) => {
    const name = tool.name.toLowerCase();
    const id = tool.id.toLowerCase();
    const kw = (tool.keywords ?? []).join(' ').toLowerCase();
    const blurb = tool.blurb.toLowerCase();
    let score = 0;
    if (name === q) score += 120;
    if (name.includes(q)) score += 40;
    if (kw.includes(q)) score += 20;
    for (const w of words) {
      if (name.includes(w)) score += 12;
      if (id.includes(w)) score += 8;
      if (kw.includes(w)) score += 6;
      if (blurb.includes(w)) score += 2;
    }
    for (const bt of boostTokens) {
      if (id.includes(bt) || kw.includes(bt) || name.includes(bt)) score += 25;
    }
    return { tool, score };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
