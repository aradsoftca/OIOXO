/**
 * Subtitle interconversion — SRT / WebVTT / YouTube SBV / ASS-SSA in, SRT / VTT /
 * SBV / plain text out. Pure string functions (no DOM).
 */
import { formatSrt, formatVtt, stripTags, type Cue } from '@/engines/subtitle';

export type SubIn = 'srt' | 'vtt' | 'sbv' | 'ass' | 'ssa';
export type SubOut = 'srt' | 'vtt' | 'sbv' | 'txt';

const clean = (t: string): string => t.replace(/^﻿/, '').replace(/\r\n?/g, '\n');

/** "H:MM:SS.mmm", "MM:SS.mmm", "HH:MM:SS,mmm", "H:MM:SS.cc" → seconds. */
export function parseClock(s: string): number {
  const m = /^(?:(\d+):)?(\d{1,2}):(\d{1,2})(?:[.,](\d{1,3}))?$/.exec(s.trim());
  if (!m) return Number.NaN;
  const frac = m[4] ? Number(`0.${m[4]}`) : 0;
  return Number(m[1] ?? 0) * 3600 + Number(m[2]) * 60 + Number(m[3]) + frac;
}

/** SRT and WebVTT (hours optional, cue settings and NOTE/STYLE blocks ignored). */
export function parseSrtVtt(text: string): Cue[] {
  const cues: Cue[] = [];
  for (const block of clean(text).split(/\n{2,}/)) {
    const lines = block.split('\n').filter((l) => l.trim().length > 0);
    const t = lines.findIndex((l) => l.includes('-->'));
    if (t < 0) continue;
    const m = /^\s*([\d:.,]+)\s*-->\s*([\d:.,]+)/.exec(lines[t]);
    if (!m) continue;
    const start = parseClock(m[1]), end = parseClock(m[2]);
    if (Number.isNaN(start) || Number.isNaN(end)) continue;
    cues.push({ index: cues.length + 1, start, end, text: lines.slice(t + 1).join('\n').trim() });
  }
  return cues;
}

/** YouTube .sbv: "0:00:01.000,0:00:04.000" then the text lines, blocks separated by a blank line. */
export function parseSbv(text: string): Cue[] {
  const cues: Cue[] = [];
  for (const block of clean(text).split(/\n{2,}/)) {
    const lines = block.split('\n').filter((l) => l.trim().length > 0);
    if (!lines.length) continue;
    const m = /^\s*([\d:.]+)\s*,\s*([\d:.]+)\s*$/.exec(lines[0]);
    if (!m) continue;
    const start = parseClock(m[1]), end = parseClock(m[2]);
    if (Number.isNaN(start) || Number.isNaN(end)) continue;
    cues.push({ index: cues.length + 1, start, end, text: lines.slice(1).join('\n').trim() });
  }
  return cues;
}

/** ASS / SSA: the [Events] "Format:" line names the columns; Text is always last. */
export function parseAss(text: string): Cue[] {
  const cues: Cue[] = [];
  let inEvents = false;
  let cols: string[] = ['layer', 'start', 'end', 'style', 'name', 'marginl', 'marginr', 'marginv', 'effect', 'text'];
  for (const raw of clean(text).split('\n')) {
    const line = raw.trim();
    if (/^\[.*\]$/.test(line)) { inEvents = /^\[events\]$/i.test(line); continue; }
    if (!inEvents) continue;
    const f = /^format\s*:\s*(.*)$/i.exec(line);
    if (f) { cols = f[1].split(',').map((c) => c.trim().toLowerCase()); continue; }
    const d = /^dialogue\s*:\s*(.*)$/i.exec(line);
    if (!d) continue;
    const parts = d[1].split(',');
    const fields = [...parts.slice(0, cols.length - 1), parts.slice(cols.length - 1).join(',')];
    const get = (k: string): string => fields[cols.indexOf(k)] ?? '';
    const start = parseClock(get('start')), end = parseClock(get('end'));
    if (Number.isNaN(start) || Number.isNaN(end)) continue;
    const body = stripTags(get('text')).trim();
    if (body) cues.push({ index: 0, start, end, text: body });
  }
  return cues.sort((a, b) => a.start - b.start).map((c, i) => ({ ...c, index: i + 1 }));
}

export function parseSubtitle(text: string, from: SubIn): Cue[] {
  if (from === 'sbv') return parseSbv(text);
  if (from === 'ass' || from === 'ssa') return parseAss(text);
  return parseSrtVtt(text);
}

/** SBV timestamp: H:MM:SS.mmm (single-digit hour, as YouTube writes it). */
export function formatSbv(sec: number): string {
  return formatVtt(sec).replace(/^0(\d):/, '$1:');
}

export function writeSubtitle(cues: Cue[], to: SubOut): string {
  if (to === 'txt') return cues.map((c) => stripTags(c.text)).join('\n') + '\n';
  if (to === 'sbv') return cues.map((c) => `${formatSbv(c.start)},${formatSbv(c.end)}\n${c.text}`).join('\n\n') + '\n';
  const ts = to === 'vtt' ? formatVtt : formatSrt;
  const body = cues.map((c, i) => `${i + 1}\n${ts(c.start)} --> ${ts(c.end)}\n${c.text}`).join('\n\n');
  return to === 'vtt' ? `WEBVTT\n\n${body}\n` : `${body}\n`;
}

export function convertSubtitle(text: string, from: SubIn, to: SubOut): string {
  const cues = parseSubtitle(text, from);
  if (!cues.length) throw new Error(`No subtitle cues found in this .${from} file.`);
  return writeSubtitle(cues, to);
}
