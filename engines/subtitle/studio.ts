/**
 * Caption Studio engine — modern auto-captions with word-level timing, on-device.
 *
 * Builds on the word-timestamp Whisper output to produce the styles people
 * actually want on Reels / TikTok / Shorts:
 *   • word    — one word pops at a time (fast karaoke look)
 *   • phrase  — short 2–4 word bursts
 *   • karaoke — a phrase on screen with the spoken word highlighted
 *   • classic — traditional full-line captions
 *
 * Each "overlay item" is a transparent styled PNG enabled for a time window;
 * they're burned in one ffmpeg pass (same technique as the Add-Text tool, so no
 * libass needed). Captions can use the ORIGINAL language or a translation.
 */
import { transcribe } from '@/engines/transcribe';

export interface Word { text: string; start: number; end: number }
export interface Segment { text: string; start: number; end: number; words: Word[] }
export type CaptionMode = 'word' | 'phrase' | 'karaoke' | 'classic';

export interface StudioStyle {
  fontSize: number;            // at a 1280px-wide reference
  color: string;               // base text
  highlightColor: string;      // active word / accent
  decoration: 'box' | 'outline' | 'plain';
  position: 'bottom' | 'center' | 'top';
  uppercase: boolean;
  maxWords: number;            // grouping for phrase / karaoke
}

export interface Preset { id: string; name: string; mode: CaptionMode; style: StudioStyle }
export const PRESETS: Preset[] = [
  { id: 'reels',   name: 'Reels (word pop)', mode: 'word',    style: { fontSize: 72, color: '#ffffff', highlightColor: '#ffe14d', decoration: 'outline', position: 'center', uppercase: true,  maxWords: 1 } },
  { id: 'karaoke', name: 'Karaoke highlight', mode: 'karaoke', style: { fontSize: 58, color: '#ffffff', highlightColor: '#2dd4ff', decoration: 'outline', position: 'bottom', uppercase: false, maxWords: 4 } },
  { id: 'burst',   name: 'Fast bursts',      mode: 'phrase',  style: { fontSize: 60, color: '#ffffff', highlightColor: '#ffe14d', decoration: 'box',     position: 'center', uppercase: true,  maxWords: 3 } },
  { id: 'classic', name: 'Classic captions', mode: 'classic', style: { fontSize: 46, color: '#ffffff', highlightColor: '#ffe14d', decoration: 'box',     position: 'bottom', uppercase: false, maxWords: 8 } },
  { id: 'minimal', name: 'Minimal',          mode: 'phrase',  style: { fontSize: 44, color: '#ffffff', highlightColor: '#ffffff', decoration: 'outline', position: 'bottom', uppercase: false, maxWords: 5 } },
];

/** Transcribe to a flat word list (word-level timestamps). */
export async function videoToWords(file: File, opts: { size?: 'tiny' | 'base' | 'small'; language?: string; onProgress?: (phase: string, r: number) => void } = {}): Promise<Word[]> {
  const report = opts.onProgress ?? (() => {});
  let blob: Blob = file;
  try {
    const res = await transcribe(file, { size: opts.size ?? 'tiny', language: opts.language, wordTimestamps: true, onProgress: (p) => report(p.phase, 0.1 + p.ratio * 0.85) });
    if (res.chunks.length) return res.chunks.map((c) => ({ text: c.text.trim(), start: c.start, end: c.end })).filter((w) => w.text);
  } catch { /* extract audio first */ }
  const { runFfmpeg, extOf } = await import('@/engines/ffmpeg');
  blob = await runFfmpeg({ input: file, inputName: `in.${extOf(file.name) || 'mp4'}`, outputName: 'out.wav', args: (i, o) => ['-i', i, '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', o], mimeType: 'audio/wav' });
  const res = await transcribe(blob, { size: opts.size ?? 'tiny', language: opts.language, wordTimestamps: true, onProgress: (p) => report(p.phase, 0.2 + p.ratio * 0.75) });
  return res.chunks.map((c) => ({ text: c.text.trim(), start: c.start, end: c.end })).filter((w) => w.text);
}

/** Group words into segments for the chosen mode. */
export function groupSegments(words: Word[], mode: CaptionMode, maxWords: number): Segment[] {
  if (!words.length) return [];
  if (mode === 'word') return words.map((w) => ({ text: w.text, start: w.start, end: w.end, words: [w] }));
  const segs: Segment[] = [];
  let cur: Word[] = [];
  const flush = () => { if (cur.length) { segs.push({ text: cur.map((w) => w.text).join(' '), start: cur[0].start, end: cur[cur.length - 1].end, words: cur }); cur = []; } };
  for (let i = 0; i < words.length; i++) {
    cur.push(words[i]);
    const gap = i + 1 < words.length ? words[i + 1].start - words[i].end : 0;
    const punct = /[.!?،,؛:]$/.test(words[i].text);
    if (cur.length >= maxWords || gap > 0.6 || punct) flush();
  }
  flush();
  return segs;
}

/** Render a styled caption PNG. activeIdx highlights one word (karaoke); null = none. */
function renderPng(words: string[], activeIdx: number | null, vw: number, vh: number, st: StudioStyle): Promise<Blob> {
  const canvas = document.createElement('canvas'); canvas.width = vw; canvas.height = vh;
  const ctx = canvas.getContext('2d')!;
  const scale = vw / 1280;
  const fs = Math.max(14, Math.round(st.fontSize * scale));
  const toks = words.map((w) => st.uppercase ? w.toUpperCase() : w);
  ctx.font = `900 ${fs}px system-ui, -apple-system, "Segoe UI", sans-serif`;
  ctx.textBaseline = 'middle';
  const space = ctx.measureText(' ').width;

  // wrap tokens into lines within 88% width
  const maxW = vw * 0.88;
  const lines: { toks: string[]; idx: number[] }[] = [];
  let line: { toks: string[]; idx: number[] } = { toks: [], idx: [] }; let lw = 0;
  toks.forEach((t, i) => {
    const w = ctx.measureText(t).width;
    if (lw + w > maxW && line.toks.length) { lines.push(line); line = { toks: [], idx: [] }; lw = 0; }
    line.toks.push(t); line.idx.push(i); lw += w + space;
  });
  if (line.toks.length) lines.push(line);

  const lineH = fs * 1.3;
  const blockH = lines.length * lineH;
  const margin = vh * 0.08;
  const cy = st.position === 'top' ? margin + blockH / 2 : st.position === 'center' ? vh / 2 : vh - margin - blockH / 2;

  lines.forEach((ln, li) => {
    const widths = ln.toks.map((t) => ctx.measureText(t).width);
    const total = widths.reduce((a, b) => a + b, 0) + space * (ln.toks.length - 1);
    let x = vw / 2 - total / 2;
    const y = cy - blockH / 2 + lineH / 2 + li * lineH;
    ln.toks.forEach((t, k) => {
      const w = widths[k]; const cxw = x + w / 2; const active = activeIdx != null && ln.idx[k] === activeIdx;
      if (st.decoration === 'box' || active) {
        ctx.fillStyle = active ? st.highlightColor : 'rgba(0,0,0,0.6)';
        const pad = fs * 0.18; const h = lineH * 0.92; const r = h * 0.22;
        ctx.beginPath(); ctx.roundRect(x - pad, y - h / 2, w + pad * 2, h, r); ctx.fill();
      }
      if (st.decoration === 'outline' && !active) { ctx.lineWidth = Math.max(2, fs * 0.16); ctx.strokeStyle = 'rgba(0,0,0,0.9)'; ctx.lineJoin = 'round'; ctx.strokeText(t, cxw, y); }
      ctx.fillStyle = active && st.decoration !== 'box' ? st.highlightColor : (active && st.decoration === 'box' ? '#111111' : st.color);
      ctx.textAlign = 'center'; ctx.fillText(t, cxw, y);
      x += w + space;
    });
  });
  return new Promise<Blob>((res, rej) => canvas.toBlob((b) => b ? res(b) : rej(new Error('render failed')), 'image/png'));
}

export interface OverlayItem { png: Blob; start: number; end: number }

/** Build the timed overlay PNGs for a set of segments + mode + style. */
export async function buildOverlays(segments: Segment[], mode: CaptionMode, vw: number, vh: number, st: StudioStyle): Promise<OverlayItem[]> {
  const items: OverlayItem[] = [];
  for (const seg of segments) {
    if (mode === 'karaoke' && seg.words.length > 1) {
      // one PNG per word: the phrase stays on screen with the spoken word highlighted
      for (let i = 0; i < seg.words.length; i++) {
        const png = await renderPng(seg.words.map((w) => w.text), i, vw, vh, st);
        items.push({ png, start: seg.words[i].start, end: seg.words[i].end });
      }
    } else {
      const png = await renderPng(seg.words.map((w) => w.text), null, vw, vh, st);
      items.push({ png, start: seg.start, end: seg.end });
    }
  }
  return items;
}

/** Burn timed overlay PNGs into the video in one ffmpeg pass. */
export async function burnOverlays(file: File, items: OverlayItem[], onProgress?: (r: number) => void): Promise<Blob> {
  const { runFfmpegMulti, extOf } = await import('@/engines/ffmpeg');
  const usable = items.filter((it) => it.end > it.start);
  if (!usable.length) throw new Error('No captions to burn in');
  const inputs = [
    { name: `vid.${extOf(file.name) || 'mp4'}`, data: file },
    ...usable.map((it, i) => ({ name: `c${i}.png`, data: it.png })),
  ];
  const args = (names: string[], o: string): string[] => {
    const parts: string[] = []; let last = '0:v';
    usable.forEach((it, i) => {
      const out = i === usable.length - 1 ? 'vout' : `v${i + 1}`;
      parts.push(`[${last}][${i + 1}:v]overlay=0:0:enable='between(t,${it.start.toFixed(2)},${it.end.toFixed(2)})'[${out}]`);
      last = out;
    });
    return [
      ...names.flatMap((n) => ['-i', n]),
      '-filter_complex', parts.join(';'),
      '-map', '[vout]', '-map', '0:a?',
      '-c:v', 'libx264', '-preset', 'fast', '-crf', '23', '-pix_fmt', 'yuv420p',
      '-c:a', 'copy', '-movflags', '+faststart', o,
    ];
  };
  return runFfmpegMulti({ inputs, outputName: 'out.mp4', args, mimeType: 'video/mp4', onProgress });
}
