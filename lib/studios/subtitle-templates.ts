// Subtitle Studio templates — ready-made caption projects per platform.
//
// The studio already has caption STYLE presets (SUBTITLE_STYLES); a template
// goes further: a starter set of example cues + a matching style, so a user
// lands in a ready-to-edit caption project (TikTok word-pop, lyric video,
// interview lower-thirds…) instead of an empty timeline. Materializes into the
// studio's DocState — the shape loadProject returns. Offline, no model.

import { SUBTITLE_STYLES, type SubtitleStylePreset } from './templates';

export type SubtitleTemplateCategory = 'social' | 'video' | 'music' | 'interview' | 'education';

interface CueStyleLike {
  font: string; size: number; color: string; weight: number; italic: boolean;
  outline: boolean; outlineColor: string; outlineWidth: number;
  shadow: boolean; shadowColor: string; shadowBlur: number;
  background: 'none' | 'box'; bgColor: string; pos: 'top' | 'center' | 'bottom';
}

interface CueLike { id: string; start: number; end: number; text: string }

interface SubtitleDocLike {
  name: string;
  cues: CueLike[];
  selectedId: string | null;
  style: CueStyleLike;
  fps: number;
  language: string;
}

export interface SubtitleTemplate {
  id: string;
  name: string;
  category: SubtitleTemplateCategory;
  description: string;
  /** Id of a SUBTITLE_STYLES preset to base the style on. */
  styleId: string;
  /** Sample cues (text + timing) the user replaces with their own. */
  cues: { start: number; end: number; text: string }[];
  language?: string;
}

const DEFAULT_STYLE: CueStyleLike = {
  font: 'Arial, sans-serif', size: 48, color: '#ffffff', weight: 700, italic: false,
  outline: true, outlineColor: '#000000', outlineWidth: 4,
  shadow: false, shadowColor: 'rgba(0,0,0,.8)', shadowBlur: 6,
  background: 'none', bgColor: 'rgba(0,0,0,.7)', pos: 'bottom',
};

function styleFromPreset(id: string): CueStyleLike {
  const p = SUBTITLE_STYLES.find(s => s.id === id);
  if (!p) return { ...DEFAULT_STYLE };
  return {
    ...DEFAULT_STYLE,
    font: p.font, size: p.size, color: p.color, weight: p.weight, italic: p.italic,
    outline: p.outline, outlineColor: p.outlineColor, outlineWidth: p.outlineWidth,
    background: p.background, bgColor: p.bgColor, pos: p.pos,
  };
}

export const SUBTITLE_TEMPLATES: SubtitleTemplate[] = [
  {
    id: 'tiktok-pop', name: 'TikTok Word Pop', category: 'social',
    description: 'Big bold center captions — one phrase at a time.',
    styleId: 'tiktok-pop',
    cues: [
      { start: 0, end: 1.2, text: 'WAIT' },
      { start: 1.2, end: 2.6, text: 'FOR IT' },
      { start: 2.6, end: 4.5, text: 'THIS CHANGES\nEVERYTHING' },
    ],
  },
  {
    id: 'reels-yellow', name: 'Reels Yellow Pop', category: 'social',
    description: 'Viral yellow captions for Reels/Shorts.',
    styleId: 'reels-yellow',
    cues: [
      { start: 0, end: 2, text: "HERE'S THE TRICK" },
      { start: 2, end: 4.5, text: 'nobody tells you' },
      { start: 4.5, end: 7, text: 'SAVE THIS 👇' },
    ],
  },
  {
    id: 'karaoke', name: 'Karaoke Sing-Along', category: 'music',
    description: 'Highlighted lyric captions for sing-alongs.',
    styleId: 'karaoke',
    cues: [
      { start: 0, end: 3, text: 'first line of the song' },
      { start: 3, end: 6, text: 'second line goes here' },
      { start: 6, end: 9, text: 'and the chorus hits' },
    ],
  },
  {
    id: 'lyric-cinema', name: 'Lyric Video', category: 'music',
    description: 'Elegant centered lyrics over your track.',
    styleId: 'cinema-italic',
    cues: [
      { start: 0, end: 4, text: 'the opening verse' },
      { start: 4, end: 8, text: 'a second softer line' },
      { start: 8, end: 12, text: 'the hook everyone knows' },
    ],
  },
  {
    id: 'interview', name: 'Interview Lower-Third', category: 'interview',
    description: 'Clean documentary-style subtitles.',
    styleId: 'documentary',
    cues: [
      { start: 0, end: 4, text: 'So when I first started out,' },
      { start: 4, end: 8, text: 'I had no idea what I was doing.' },
      { start: 8, end: 12, text: 'But that turned out to be the best part.' },
    ],
  },
  {
    id: 'podcast-clip', name: 'Podcast Clip', category: 'interview',
    description: 'Readable captions for audiogram clips.',
    styleId: 'reels-white',
    cues: [
      { start: 0, end: 3, text: "And that's the thing people miss —" },
      { start: 3, end: 6.5, text: 'consistency beats intensity every time.' },
    ],
  },
  {
    id: 'tutorial-steps', name: 'Tutorial Steps', category: 'education',
    description: 'Step-by-step captions for how-to videos.',
    styleId: 'edu-pop',
    cues: [
      { start: 0, end: 3, text: 'Step 1 — open the app' },
      { start: 3, end: 6, text: 'Step 2 — tap the + button' },
      { start: 6, end: 9, text: 'Step 3 — and you\'re done!' },
    ],
  },
  {
    id: 'documentary', name: 'Documentary', category: 'video',
    description: 'Soft cinematic captions for film.',
    styleId: 'cinema-classic',
    cues: [
      { start: 0, end: 4, text: 'In the winter of that year,' },
      { start: 4, end: 9, text: 'everything was about to change.' },
    ],
  },
  {
    id: 'news', name: 'Broadcast News', category: 'video',
    description: 'TV-news boxed captions.',
    styleId: 'broadcast-news',
    cues: [
      { start: 0, end: 4, text: 'Breaking developments tonight as officials confirm' },
      { start: 4, end: 8, text: 'the new measures take effect immediately.' },
    ],
  },
  {
    id: 'gaming', name: 'Gaming Stream', category: 'social',
    description: 'Neon captions for gaming clips.',
    styleId: 'gaming-stream',
    cues: [
      { start: 0, end: 2, text: 'NO WAY' },
      { start: 2, end: 4, text: 'did you see that?!' },
      { start: 4, end: 6.5, text: 'GG' },
    ],
  },
  {
    id: 'language-learn', name: 'Language Learning', category: 'education',
    description: 'High-contrast captions for study videos.',
    styleId: 'high-contrast',
    cues: [
      { start: 0, end: 3, text: 'Hello — how are you?' },
      { start: 3, end: 6, text: 'I am fine, thank you.' },
    ],
  },
  {
    id: 'accessibility', name: 'Accessible Captions', category: 'video',
    description: 'Maximum-readability captions (a11y).',
    styleId: 'high-contrast',
    cues: [
      { start: 0, end: 3, text: '[upbeat music playing]' },
      { start: 3, end: 7, text: 'Welcome back to the channel.' },
    ],
  },
  {
    id: 'netflix-style', name: 'Streaming (Netflix)', category: 'video',
    description: 'Clean streaming-style subtitles.',
    styleId: 'netflix',
    cues: [
      { start: 0, end: 3.5, text: "We need to talk about what happened." },
      { start: 3.5, end: 7, text: "I know. I've been thinking about it too." },
    ],
  },
  {
    id: 'youtube-auto', name: 'YouTube Standard', category: 'video',
    description: 'Familiar boxed YouTube captions.',
    styleId: 'youtube',
    cues: [
      { start: 0, end: 3, text: "what's up everyone, welcome back" },
      { start: 3, end: 6, text: "today we're trying something new" },
    ],
  },
  {
    id: 'reels-soft', name: 'Reels Soft', category: 'social',
    description: 'Cleaner bottom captions for Reels.',
    styleId: 'reels-soft',
    cues: [
      { start: 0, end: 2.5, text: 'the one thing I wish I knew' },
      { start: 2.5, end: 5, text: 'before I started' },
    ],
  },
  {
    id: 'magazine', name: 'Editorial Caption', category: 'social',
    description: 'Stylish magazine-style italic captions.',
    styleId: 'magazine',
    cues: [
      { start: 0, end: 3.5, text: 'a closer look at the\nthings that matter' },
    ],
  },
  {
    id: 'comic', name: 'Comic Book', category: 'social',
    description: 'Bold comic-style burst captions.',
    styleId: 'comic',
    cues: [
      { start: 0, end: 1.5, text: 'BOOM!' },
      { start: 1.5, end: 3.5, text: 'plot twist…' },
    ],
  },
  {
    id: 'sports', name: 'Sports Banner', category: 'video',
    description: 'High-energy sports lower-third.',
    styleId: 'broadcast-sports',
    cues: [
      { start: 0, end: 3, text: 'WHAT A GOAL!' },
      { start: 3, end: 6, text: 'right in the top corner' },
    ],
  },
  {
    id: 'gaming-neon', name: 'Gaming Neon', category: 'social',
    description: 'Bright magenta neon gaming captions.',
    styleId: 'gaming-neon',
    cues: [
      { start: 0, end: 2, text: 'CLUTCH' },
      { start: 2, end: 4, text: 'are you KIDDING me' },
    ],
  },
  {
    id: 'edu-clean', name: 'Lecture / Course', category: 'education',
    description: 'Readable lecture-style captions.',
    styleId: 'edu-clean',
    cues: [
      { start: 0, end: 4, text: 'In this lesson we will cover three ideas.' },
      { start: 4, end: 8, text: 'First, the core concept and why it matters.' },
    ],
  },
];

export function subtitleTemplatesByCategory(cat: SubtitleTemplateCategory | 'all'): SubtitleTemplate[] {
  return cat === 'all' ? SUBTITLE_TEMPLATES : SUBTITLE_TEMPLATES.filter(t => t.category === cat);
}

export const SUBTITLE_TEMPLATE_CATEGORIES: { id: SubtitleTemplateCategory | 'all'; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'social', label: 'Social' },
  { id: 'video', label: 'Video' },
  { id: 'music', label: 'Music / Lyrics' },
  { id: 'interview', label: 'Interview' },
  { id: 'education', label: 'Education' },
];

let _sid = 0;
function ssid() { return `sc${++_sid}_${Math.random().toString(36).slice(2, 5)}`; }

export function materializeSubtitleTemplate(t: SubtitleTemplate): SubtitleDocLike {
  return {
    name: t.name,
    cues: t.cues.map(c => ({ id: ssid(), start: c.start, end: c.end, text: c.text })),
    selectedId: null,
    style: styleFromPreset(t.styleId),
    fps: 30,
    language: t.language || 'en',
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Thumbnail: a 16:9 dark "video frame" with a sample caption in the template's
// style at its intended position.
// ─────────────────────────────────────────────────────────────────────────────

export function renderSubtitleThumb(t: SubtitleTemplate, w = 360, h = 203): string {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  c.dataset.nowm = '1';
  const ctx = c.getContext('2d')!;
  // Dark "video" backdrop with a subtle vignette.
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#1f2937'); g.addColorStop(1, '#0b1220');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);

  const style = styleFromPreset(t.styleId);
  const sample = (t.cues[0]?.text || t.name).split('\n').slice(0, 2);
  // Scale the caption to the thumb (style.size is px at ~1080p caption height).
  const fontPx = Math.max(13, Math.min(34, style.size * (h / 1080) * 3.2));
  ctx.font = `${style.italic ? 'italic ' : ''}${style.weight} ${fontPx}px ${style.font}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const lh = fontPx * 1.15;
  const cy = style.pos === 'top' ? h * 0.2 : style.pos === 'center' ? h * 0.5 : h * 0.8;
  let y = cy - ((sample.length - 1) * lh) / 2;

  for (const line of sample) {
    if (style.background === 'box') {
      const tw = ctx.measureText(line).width;
      ctx.fillStyle = style.bgColor;
      ctx.fillRect(w / 2 - tw / 2 - 8, y - lh / 2, tw + 16, lh);
    }
    if (style.outline && style.outlineWidth > 0) {
      ctx.lineWidth = Math.max(1, style.outlineWidth * (h / 1080) * 3.2);
      ctx.strokeStyle = style.outlineColor;
      ctx.lineJoin = 'round';
      ctx.strokeText(line, w / 2, y);
    }
    ctx.fillStyle = style.color;
    ctx.fillText(line, w / 2, y);
    y += lh;
  }
  return c.toDataURL('image/png');
}
