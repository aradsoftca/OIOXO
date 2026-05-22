/**
 * Subtitle parsing + writing for SRT and WebVTT formats.
 * Cue text supports inline tags (bold, italic, color) — we keep them as raw text.
 */

export interface Cue {
  /** Sequence index (1-based). */
  index: number;
  /** Start time in seconds. */
  start: number;
  /** End time in seconds. */
  end: number;
  /** Subtitle text — may span multiple lines, may contain inline tags. */
  text: string;
}

/** Parse "HH:MM:SS,mmm" or "HH:MM:SS.mmm" → seconds. */
export function parseTime(s: string): number {
  const m = /^(\d{1,2}):(\d{2}):(\d{2})[.,](\d{1,3})$/.exec(s.trim());
  if (!m) return Number.NaN;
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number(m[4].padEnd(3, '0')) / 1000;
}

/** Format seconds → SRT timestamp (HH:MM:SS,mmm). */
export function formatSrt(sec: number): string {
  if (sec < 0) sec = 0;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const ms = Math.round((sec - Math.floor(sec)) * 1000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}

/** Format seconds → WebVTT timestamp (HH:MM:SS.mmm). */
export function formatVtt(sec: number): string {
  return formatSrt(sec).replace(',', '.');
}

/** Detect SRT vs VTT from contents. Defaults to SRT. */
export function detectFormat(text: string): 'srt' | 'vtt' {
  return /^\s*WEBVTT/m.test(text) ? 'vtt' : 'srt';
}

/** Parse SRT or VTT. Lenient — tolerates missing indices, blank lines, etc. */
export function parse(text: string): Cue[] {
  const cues: Cue[] = [];
  // Strip BOM, normalize line endings
  const t = text.replace(/^﻿/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  // Drop WEBVTT header + style/region blocks at start
  const body = t.replace(/^WEBVTT[^\n]*\n(?:[^\n]+\n)*?(?=\n)/i, '');

  // Split into blocks by blank lines
  const blocks = body.split(/\n{2,}/);
  let auto = 0;
  for (const raw of blocks) {
    const lines = raw.split('\n').filter((l) => l.length > 0);
    if (lines.length === 0) continue;
    // Find the time line
    let i = 0;
    let timeIdx = -1;
    for (let j = 0; j < lines.length; j++) {
      if (lines[j].includes('-->')) { timeIdx = j; break; }
    }
    if (timeIdx < 0) continue;

    let index = auto + 1;
    if (timeIdx > 0) {
      const maybe = parseInt(lines[0].trim(), 10);
      if (!Number.isNaN(maybe)) index = maybe;
    }
    const timeLine = lines[timeIdx];
    const m = /^([\d:.,]+)\s*-->\s*([\d:.,]+)/.exec(timeLine);
    if (!m) continue;
    const start = parseTime(m[1]);
    const end   = parseTime(m[2]);
    if (Number.isNaN(start) || Number.isNaN(end)) continue;

    const text = lines.slice(timeIdx + 1).join('\n').trim();
    cues.push({ index, start, end, text });
    auto++;
    i++; void i;
  }
  return cues.map((c, i) => ({ ...c, index: i + 1 }));
}

export interface FormatOptions {
  format?: 'srt' | 'vtt';
  /** Re-number cues to be sequential (recommended). */
  reindex?: boolean;
}

export function write(cues: Cue[], opts: FormatOptions = {}): string {
  const fmt = opts.format ?? 'srt';
  const ts = fmt === 'vtt' ? formatVtt : formatSrt;
  const sep = ' --> ';
  const reindexed = opts.reindex !== false ? cues.map((c, i) => ({ ...c, index: i + 1 })) : cues;
  const body = reindexed
    .map((c) => `${c.index}\n${ts(c.start)}${sep}${ts(c.end)}\n${c.text}`)
    .join('\n\n');
  return fmt === 'vtt' ? `WEBVTT\n\n${body}\n` : body + '\n';
}

/** Shift every cue's start + end by `seconds`. Negative shifts earlier. */
export function shift(cues: Cue[], seconds: number): Cue[] {
  return cues.map((c) => ({
    ...c,
    start: Math.max(0, c.start + seconds),
    end:   Math.max(0, c.end   + seconds),
  }));
}

/** Scale every cue's timing by `factor`. Useful for FPS conversion. */
export function scale(cues: Cue[], factor: number): Cue[] {
  return cues.map((c) => ({ ...c, start: c.start * factor, end: c.end * factor }));
}

/** Strip inline tags ({\b}, <i>, etc.) and ASS/SSA styling. */
export function stripTags(text: string): string {
  return text
    .replace(/\{\\[^}]*\}/g, '')      // ASS / SSA inline overrides
    .replace(/<[^>]+>/g, '')          // HTML-ish tags
    .replace(/\\N/g, '\n')            // ASS line break
    .replace(/\\h/g, ' ');            // non-breaking space
}

/** Plain dialogue: concatenate cue texts, one per line. */
export function toPlainText(cues: Cue[], separator = '\n'): string {
  return cues.map((c) => stripTags(c.text).replace(/\n/g, ' ')).join(separator);
}
