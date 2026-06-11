import { blankCanvas, cloneCanvas, hexToRgb, rgbToHex } from './canvas';

export interface EnhanceResult {
  canvas: HTMLCanvasElement;
  /** 0 = identity (already perfect), ~1 = heavy correction. Lets the UI say
   *  "Already well-balanced" instead of a misleading "Enhanced" on a no-op. */
  magnitude: number;
}

export function autoEnhance(src: HTMLCanvasElement): EnhanceResult {
  const w = src.width, h = src.height;
  const out = blankCanvas(w, h);
  const ctx = out.getContext('2d')!;
  ctx.drawImage(src, 0, 0);
  const img = ctx.getImageData(0, 0, w, h);
  const data = img.data;

  let rMin = 255, rMax = 0, gMin = 255, gMax = 0, bMin = 255, bMax = 0;
  const histR = new Uint32Array(256), histG = new Uint32Array(256), histB = new Uint32Array(256);
  const total = (data.length / 4) | 0;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    histR[r]++; histG[g]++; histB[b]++;
  }
  const cut = Math.max(1, Math.floor(total * 0.005));
  const percentileLow = (hist: Uint32Array): number => {
    let acc = 0;
    for (let i = 0; i < 256; i++) { acc += hist[i]; if (acc >= cut) return i; }
    return 0;
  };
  const percentileHigh = (hist: Uint32Array): number => {
    let acc = 0;
    for (let i = 255; i >= 0; i--) { acc += hist[i]; if (acc >= cut) return i; }
    return 255;
  };
  rMin = percentileLow(histR); rMax = percentileHigh(histR);
  gMin = percentileLow(histG); gMax = percentileHigh(histG);
  bMin = percentileLow(histB); bMax = percentileHigh(histB);

  const rSpan = Math.max(1, rMax - rMin);
  const gSpan = Math.max(1, gMax - gMin);
  const bSpan = Math.max(1, bMax - bMin);

  let sumR = 0, sumG = 0, sumB = 0;
  const sampleStride = Math.max(1, Math.floor(total / 50000));
  let samples = 0;
  for (let i = 0; i < data.length; i += 4 * sampleStride) {
    sumR += data[i]; sumG += data[i + 1]; sumB += data[i + 2]; samples++;
  }
  const avgR = sumR / samples, avgG = sumG / samples, avgB = sumB / samples;
  const gray = (avgR + avgG + avgB) / 3;
  const wbR = gray / Math.max(1, avgR), wbG = gray / Math.max(1, avgG), wbB = gray / Math.max(1, avgB);

  for (let i = 0; i < data.length; i += 4) {
    let r = (data[i] - rMin) * (255 / rSpan); r *= wbR;
    let g = (data[i + 1] - gMin) * (255 / gSpan); g *= wbG;
    let b = (data[i + 2] - bMin) * (255 / bSpan); b *= wbB;
    data[i] = Math.max(0, Math.min(255, r));
    data[i + 1] = Math.max(0, Math.min(255, g));
    data[i + 2] = Math.max(0, Math.min(255, b));
  }
  ctx.putImageData(img, 0, 0);

  const sharp = blankCanvas(w, h);
  const sctx = sharp.getContext('2d')!;
  sctx.drawImage(out, 0, 0);
  sctx.filter = 'contrast(102%)';
  sctx.drawImage(out, 0, 0);
  sctx.filter = 'none';

  // How far from identity was the correction? Levels stretch away from the full
  // 0..255 range and white-balance away from 1.0 are the two adjustments; combine
  // them into a single 0..~1 magnitude so the UI can be honest about "no-op"s.
  const levelDev =
    (Math.abs(rMin) + (255 - rMax) + Math.abs(gMin) + (255 - gMax) + Math.abs(bMin) + (255 - bMax)) / (6 * 255);
  const wbDev = (Math.abs(wbR - 1) + Math.abs(wbG - 1) + Math.abs(wbB - 1)) / 3;
  const magnitude = Math.min(1, levelDev * 1.5 + wbDev * 2);

  return { canvas: sharp, magnitude };
}

export function extractPalette(src: HTMLCanvasElement, k = 6): string[] {
  const ctx = src.getContext('2d')!;
  const w = src.width, h = src.height;
  const stride = Math.max(1, Math.floor(Math.sqrt((w * h) / 5000)));
  const pixels: number[][] = [];
  const data = ctx.getImageData(0, 0, w, h).data;
  for (let y = 0; y < h; y += stride) for (let x = 0; x < w; x += stride) {
    const o = (y * w + x) * 4;
    if (data[o + 3] < 128) continue;
    pixels.push([data[o], data[o + 1], data[o + 2]]);
  }
  if (!pixels.length) return [];
  const centers: number[][] = [];
  for (let i = 0; i < k; i++) centers.push(pixels[Math.floor((i / k) * pixels.length)]);
  for (let iter = 0; iter < 6; iter++) {
    const sums = centers.map(() => [0, 0, 0, 0]);
    for (const p of pixels) {
      let best = 0, bd = Infinity;
      for (let i = 0; i < k; i++) {
        const c = centers[i];
        const d = (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2 + (p[2] - c[2]) ** 2;
        if (d < bd) { bd = d; best = i; }
      }
      sums[best][0] += p[0]; sums[best][1] += p[1]; sums[best][2] += p[2]; sums[best][3]++;
    }
    for (let i = 0; i < k; i++) {
      if (sums[i][3] > 0) centers[i] = [sums[i][0] / sums[i][3], sums[i][1] / sums[i][3], sums[i][2] / sums[i][3]];
    }
  }
  centers.sort((a, b) => (b[0] + b[1] + b[2]) - (a[0] + a[1] + a[2]));
  return centers.map(c => rgbToHex(c[0] | 0, c[1] | 0, c[2] | 0));
}

export function saliencyMap(src: HTMLCanvasElement, scale = 96): { map: Float32Array; w: number; h: number } {
  const w = src.width, h = src.height;
  const sw = Math.min(scale, w), sh = Math.round(sw * (h / w));
  const tmp = blankCanvas(sw, sh);
  const ctx = tmp.getContext('2d')!;
  ctx.drawImage(src, 0, 0, sw, sh);
  const data = ctx.getImageData(0, 0, sw, sh).data;
  const gray = new Float32Array(sw * sh);
  for (let i = 0; i < gray.length; i++) {
    const o = i * 4;
    gray[i] = (data[o] * 0.299 + data[o + 1] * 0.587 + data[o + 2] * 0.114) / 255;
  }
  const map = new Float32Array(sw * sh);
  for (let y = 1; y < sh - 1; y++) for (let x = 1; x < sw - 1; x++) {
    const o = y * sw + x;
    const gx = gray[o + 1] - gray[o - 1];
    const gy = gray[o + sw] - gray[o - sw];
    map[o] = Math.sqrt(gx * gx + gy * gy);
  }
  return { map, w: sw, h: sh };
}

export function findSaliencyCenter(src: HTMLCanvasElement): { x: number; y: number } {
  const sal = saliencyMap(src);
  let totalW = 0, cx = 0, cy = 0;
  for (let y = 0; y < sal.h; y++) for (let x = 0; x < sal.w; x++) {
    const w = sal.map[y * sal.w + x];
    if (w < 0.05) continue;
    totalW += w; cx += x * w; cy += y * w;
  }
  if (totalW === 0) return { x: src.width / 2, y: src.height / 2 };
  return { x: (cx / totalW) * (src.width / sal.w), y: (cy / totalW) * (src.height / sal.h) };
}

export function smartCrop(src: HTMLCanvasElement, aspectW: number, aspectH: number): HTMLCanvasElement {
  const targetRatio = aspectW / aspectH;
  const srcRatio = src.width / src.height;
  let cw: number, ch: number;
  if (srcRatio > targetRatio) { ch = src.height; cw = ch * targetRatio; }
  else { cw = src.width; ch = cw / targetRatio; }
  const center = findSaliencyCenter(src);
  let x = Math.round(center.x - cw / 2);
  let y = Math.round(center.y - ch / 2);
  x = Math.max(0, Math.min(src.width - cw, x));
  y = Math.max(0, Math.min(src.height - ch, y));
  const out = blankCanvas(cw, ch);
  out.getContext('2d')!.drawImage(src, x, y, cw, ch, 0, 0, cw, ch);
  return out;
}

export interface SilenceRange { start: number; end: number }

export function findSilences(buffer: AudioBuffer, opts: { thresholdDb?: number; minDurationSec?: number; mergeGapSec?: number } = {}): SilenceRange[] {
  const threshold = Math.pow(10, (opts.thresholdDb ?? -40) / 20);
  const minDur = opts.minDurationSec ?? 0.3;
  const mergeGap = opts.mergeGapSec ?? 0.1;
  const ch = buffer.numberOfChannels > 0 ? buffer.getChannelData(0) : new Float32Array(0);
  const sr = buffer.sampleRate;
  const window = Math.max(256, Math.floor(sr * 0.02));
  const ranges: SilenceRange[] = [];
  let inSilence = false;
  let silStart = 0;
  for (let i = 0; i < ch.length; i += window) {
    let energy = 0;
    const end = Math.min(ch.length, i + window);
    for (let j = i; j < end; j++) energy += ch[j] * ch[j];
    energy = Math.sqrt(energy / (end - i));
    if (energy < threshold) {
      if (!inSilence) { silStart = i; inSilence = true; }
    } else if (inSilence) {
      const dur = (i - silStart) / sr;
      if (dur >= minDur) ranges.push({ start: silStart / sr, end: i / sr });
      inSilence = false;
    }
  }
  if (inSilence) {
    const dur = (ch.length - silStart) / sr;
    if (dur >= minDur) ranges.push({ start: silStart / sr, end: ch.length / sr });
  }
  const merged: SilenceRange[] = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r.start - last.end < mergeGap) last.end = r.end;
    else merged.push({ ...r });
  }
  return merged;
}

export function detectBPM(buffer: AudioBuffer): { bpm: number; beats: number[]; confidence: number } {
  const ch = buffer.getChannelData(0);
  const sr = buffer.sampleRate;
  const window = Math.floor(sr * 0.02);
  const energy: number[] = [];
  for (let i = 0; i < ch.length; i += window) {
    let e = 0;
    const end = Math.min(ch.length, i + window);
    for (let j = i; j < end; j++) e += ch[j] * ch[j];
    energy.push(e / (end - i));
  }
  const flux: number[] = [];
  for (let i = 1; i < energy.length; i++) {
    flux.push(Math.max(0, energy[i] - energy[i - 1]));
  }
  let mean = 0; for (const f of flux) mean += f; mean /= Math.max(1, flux.length);
  let variance = 0; for (const f of flux) variance += (f - mean) ** 2; variance /= Math.max(1, flux.length);
  const std = Math.sqrt(variance);
  const threshold = mean + std * 1.4;
  const peaks: number[] = [];
  const minGap = Math.floor(60 / 200 / (window / sr));
  for (let i = 1; i < flux.length - 1; i++) {
    if (flux[i] > threshold && flux[i] >= flux[i - 1] && flux[i] >= flux[i + 1]) {
      if (peaks.length === 0 || i - peaks[peaks.length - 1] >= minGap) peaks.push(i);
    }
  }
  if (peaks.length < 4) return { bpm: 0, beats: [], confidence: 0 };
  const intervals: number[] = [];
  for (let i = 1; i < peaks.length; i++) intervals.push(peaks[i] - peaks[i - 1]);
  intervals.sort((a, b) => a - b);
  const median = intervals[Math.floor(intervals.length / 2)];
  let bpm = 60 / (median * window / sr);
  while (bpm < 70) bpm *= 2;
  while (bpm > 180) bpm /= 2;
  const beats = peaks.map(p => p * window / sr);
  const tight = intervals.filter(i => Math.abs(i - median) < median * 0.15).length;
  const confidence = tight / intervals.length;
  return { bpm: Math.round(bpm), beats, confidence };
}

export function loudnessRMSdB(buffer: AudioBuffer): number {
  const ch = buffer.getChannelData(0);
  let sum = 0;
  for (let i = 0; i < ch.length; i++) sum += ch[i] * ch[i];
  const rms = Math.sqrt(sum / ch.length);
  return 20 * Math.log10(rms + 1e-10);
}

export function suggestChordProgression(key: string, mode: 'major' | 'minor' = 'major'): string[][] {
  const KEYS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const idx = KEYS.indexOf(key);
  const root = idx < 0 ? 0 : idx;
  const scaleMaj = [0, 2, 4, 5, 7, 9, 11];
  const scale = mode === 'major' ? scaleMaj : [0, 2, 3, 5, 7, 8, 10];
  const degree = (d: number): string => KEYS[(root + scale[(d - 1) % 7]) % 12];
  const majorProgs = [['I', 'V', 'vi', 'IV'], ['I', 'IV', 'V', 'I'], ['vi', 'IV', 'I', 'V'], ['I', 'vi', 'IV', 'V']];
  const minorProgs = [['i', 'VII', 'VI', 'VII'], ['i', 'iv', 'v', 'i'], ['i', 'VI', 'III', 'VII']];
  const progs = mode === 'major' ? majorProgs : minorProgs;
  const dmap: Record<string, number> = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7, i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7 };
  return progs.map(p => p.map(d => degree(dmap[d])));
}

export function humanizeSteps<T>(notes: (T | null)[], opts: { velocityJitter?: number; timingJitter?: number } = {}): { notes: (T | null)[]; offsets: number[] } {
  const vj = opts.velocityJitter ?? 0.15;
  const tj = opts.timingJitter ?? 0.03;
  const offsets = notes.map(() => (Math.random() - 0.5) * 2 * tj);
  return { notes: notes.slice(), offsets };
}

export interface CueLike { start: number; end: number; text: string }

export function readingSpeedCps(cue: CueLike): number {
  const dur = Math.max(0.05, cue.end - cue.start);
  return cue.text.length / dur;
}

export function suggestCueSplit(cue: CueLike, maxCps = 21): { keep: CueLike; new: CueLike } | null {
  const cps = readingSpeedCps(cue);
  if (cps <= maxCps) return null;
  const text = cue.text;
  const pauses = [/[.!?][^.!?]*$/, /,[^,]*$/];
  let splitIdx = -1;
  const midpoint = text.length / 2;
  for (let i = Math.floor(midpoint - 10); i < Math.ceil(midpoint + 10) && i < text.length; i++) {
    if (i < 0) continue;
    const ch = text[i];
    if (ch === '.' || ch === '!' || ch === '?' || ch === ',' || ch === ' ') { splitIdx = i; }
  }
  if (splitIdx <= 0) splitIdx = text.lastIndexOf(' ', Math.floor(text.length / 2));
  if (splitIdx <= 0) return null;
  const dur = cue.end - cue.start;
  const firstHalfTime = (splitIdx / text.length) * dur;
  return {
    keep: { start: cue.start, end: cue.start + firstHalfTime, text: text.slice(0, splitIdx).trim() },
    new: { start: cue.start + firstHalfTime, end: cue.end, text: text.slice(splitIdx).trim() },
  };
}

export interface PiiHit { kind: 'email' | 'phone' | 'ssn' | 'credit-card' | 'iban' | 'ipv4'; text: string; start: number; end: number }

export function findPii(text: string): PiiHit[] {
  const out: PiiHit[] = [];
  const patterns: Array<{ kind: PiiHit['kind']; re: RegExp }> = [
    { kind: 'email', re: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g },
    { kind: 'phone', re: /\b(?:\+?\d{1,3}[ -]?)?\(?\d{3}\)?[ -]?\d{3}[ -]?\d{4}\b/g },
    { kind: 'ssn', re: /\b\d{3}-\d{2}-\d{4}\b/g },
    { kind: 'credit-card', re: /\b(?:\d[ -]?){13,19}\b/g },
    { kind: 'iban', re: /\b[A-Z]{2}\d{2}[ ]?(?:[A-Z0-9]{4}[ ]?){3,7}[A-Z0-9]{1,4}\b/g },
    { kind: 'ipv4', re: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g },
  ];
  for (const { kind, re } of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) out.push({ kind, text: m[0], start: m.index, end: m.index + m[0].length });
  }
  return out;
}

export function extractiveSummarize(text: string, sentenceCount = 5): string[] {
  const sentences = text.split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(s => s.length > 10);
  if (sentences.length <= sentenceCount) return sentences;
  const tokenize = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
  const STOP = new Set(['the', 'is', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from', 'as', 'be', 'are', 'was', 'were', 'this', 'that', 'these', 'those', 'it', 'its', 'we', 'they', 'he', 'she', 'his', 'her', 'i', 'you', 'do', 'does', 'did', 'have', 'has', 'had', 'will', 'would', 'should', 'could', 'can', 'may', 'might', 'not', 'no']);
  const docs = sentences.map(tokenize);
  const df = new Map<string, number>();
  for (const doc of docs) {
    const seen = new Set(doc);
    for (const w of seen) if (!STOP.has(w)) df.set(w, (df.get(w) ?? 0) + 1);
  }
  const N = docs.length;
  const idf = new Map<string, number>();
  for (const [w, n] of df) idf.set(w, Math.log(N / (1 + n)));
  const vecs = docs.map(doc => {
    const v = new Map<string, number>();
    for (const w of doc) if (!STOP.has(w)) v.set(w, (v.get(w) ?? 0) + 1);
    let sumSq = 0;
    for (const [w, c] of v) { const v2 = c * (idf.get(w) ?? 0); v.set(w, v2); sumSq += v2 * v2; }
    const norm = Math.sqrt(sumSq) || 1;
    for (const [w, c] of v) v.set(w, c / norm);
    return v;
  });
  const sim = (i: number, j: number) => {
    const a = vecs[i], b = vecs[j];
    let s = 0;
    for (const [w, x] of a) { const y = b.get(w); if (y) s += x * y; }
    return s;
  };
  let scores = new Array(N).fill(1 / N);
  for (let iter = 0; iter < 20; iter++) {
    const next = new Array(N).fill(0);
    for (let i = 0; i < N; i++) {
      let weighted = 0, totalSim = 0;
      for (let j = 0; j < N; j++) {
        if (i === j) continue;
        const s = sim(i, j);
        if (s > 0) { weighted += s * scores[j]; totalSim += s; }
      }
      next[i] = 0.15 / N + 0.85 * (totalSim > 0 ? weighted / totalSim : 0);
    }
    scores = next;
  }
  const ranked = scores.map((s, i) => ({ s, i })).sort((a, b) => b.s - a.s).slice(0, sentenceCount).sort((a, b) => a.i - b.i);
  return ranked.map(r => sentences[r.i]);
}

export function readabilityScore(text: string): { flesch: number; grade: number; words: number; sentences: number; syllables: number; level: string } {
  const sentences = (text.match(/[.!?]+/g) || []).length || 1;
  const words = (text.match(/\b\w+\b/g) || []);
  const wordCount = words.length || 1;
  const syllables = words.reduce((s, w) => s + countSyllables(w), 0);
  const flesch = 206.835 - 1.015 * (wordCount / sentences) - 84.6 * (syllables / wordCount);
  const grade = 0.39 * (wordCount / sentences) + 11.8 * (syllables / wordCount) - 15.59;
  const level = flesch >= 80 ? 'Easy' : flesch >= 60 ? 'Standard' : flesch >= 40 ? 'Fairly hard' : flesch >= 20 ? 'Difficult' : 'Very difficult';
  return { flesch: Math.round(flesch), grade: Math.round(grade * 10) / 10, words: wordCount, sentences, syllables, level };
}

function countSyllables(word: string): number {
  word = word.toLowerCase().replace(/[^a-z]/g, '');
  if (!word) return 0;
  if (word.length <= 3) return 1;
  word = word.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, '');
  const matches = word.match(/[aeiouy]{1,2}/g);
  return Math.max(1, matches ? matches.length : 1);
}

export type ColumnType = 'text' | 'number' | 'date' | 'currency' | 'percent' | 'boolean' | 'empty';

export function detectColumnType(values: any[]): ColumnType {
  let nums = 0, dates = 0, currs = 0, percs = 0, bools = 0, nonEmpty = 0;
  for (const raw of values) {
    if (raw == null || raw === '') continue;
    nonEmpty++;
    const s = String(raw).trim();
    if (/^(true|false|yes|no)$/i.test(s)) bools++;
    if (/^\$?[+-]?\d{1,3}(,\d{3})*(\.\d+)?$/.test(s) || /^\$?[+-]?\d+(\.\d+)?$/.test(s)) {
      nums++;
      if (s.startsWith('$') || /\$/.test(s)) currs++;
    } else if (/^-?\d+(\.\d+)?%$/.test(s)) {
      percs++;
    } else if (!isNaN(Date.parse(s)) && /\d{4}|\/|-/.test(s)) {
      dates++;
    }
  }
  if (!nonEmpty) return 'empty';
  const thresh = nonEmpty * 0.8;
  if (percs >= thresh) return 'percent';
  if (currs >= thresh) return 'currency';
  if (nums >= thresh) return 'number';
  if (dates >= thresh) return 'date';
  if (bools >= thresh) return 'boolean';
  return 'text';
}

export function quickStats(values: any[]): { sum: number; mean: number; median: number; min: number; max: number; stdDev: number; count: number; countNonEmpty: number } {
  const nums: number[] = [];
  let countNonEmpty = 0;
  for (const v of values) {
    if (v == null || v === '') continue;
    countNonEmpty++;
    const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/[,$%]/g, ''));
    if (!isNaN(n)) nums.push(n);
  }
  if (!nums.length) return { sum: 0, mean: 0, median: 0, min: 0, max: 0, stdDev: 0, count: 0, countNonEmpty };
  const sum = nums.reduce((s, n) => s + n, 0);
  const mean = sum / nums.length;
  const sorted = [...nums].sort((a, b) => a - b);
  const median = sorted.length % 2 === 0 ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2 : sorted[(sorted.length - 1) / 2];
  const min = sorted[0], max = sorted[sorted.length - 1];
  const variance = nums.reduce((s, n) => s + (n - mean) ** 2, 0) / nums.length;
  return { sum, mean, median, min, max, stdDev: Math.sqrt(variance), count: nums.length, countNonEmpty };
}

export function findOutliers(values: any[]): number[] {
  const nums = values.map(v => typeof v === 'number' ? v : parseFloat(String(v).replace(/[,$%]/g, ''))).filter(n => !isNaN(n));
  if (nums.length < 4) return [];
  const mean = nums.reduce((s, n) => s + n, 0) / nums.length;
  const variance = nums.reduce((s, n) => s + (n - mean) ** 2, 0) / nums.length;
  const std = Math.sqrt(variance);
  if (std === 0) return [];
  const outlierIdx: number[] = [];
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v == null || v === '') continue;
    const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/[,$%]/g, ''));
    if (isNaN(n)) continue;
    const z = Math.abs((n - mean) / std);
    if (z > 2.5) outlierIdx.push(i);
  }
  return outlierIdx;
}

export function deskewCanvas(src: HTMLCanvasElement): { angle: number; canvas: HTMLCanvasElement } {
  const sal = saliencyMap(src, 200);
  const points: { x: number; y: number }[] = [];
  for (let y = 0; y < sal.h; y++) for (let x = 0; x < sal.w; x++) {
    if (sal.map[y * sal.w + x] > 0.2) points.push({ x, y });
  }
  if (points.length < 50) return { angle: 0, canvas: cloneCanvas(src) };
  let mx = 0, my = 0;
  for (const p of points) { mx += p.x; my += p.y; }
  mx /= points.length; my /= points.length;
  let sxy = 0, sxx = 0;
  for (const p of points) { const dx = p.x - mx, dy = p.y - my; sxy += dx * dy; sxx += dx * dx; }
  const slope = sxx > 0 ? sxy / sxx : 0;
  const angle = Math.atan(slope) * (180 / Math.PI);
  if (Math.abs(angle) < 0.3) return { angle: 0, canvas: cloneCanvas(src) };
  const rad = -angle * Math.PI / 180;
  const w = src.width, h = src.height;
  const out = blankCanvas(w, h);
  const ctx = out.getContext('2d')!;
  ctx.translate(w / 2, h / 2);
  ctx.rotate(rad);
  ctx.drawImage(src, -w / 2, -h / 2);
  return { angle, canvas: out };
}

export function smartFill(examples: string[], targets: string[]): string[] {
  if (!examples.length || !targets.length) return targets;
  const transforms: Array<(s: string) => string> = [
    s => s.toUpperCase(),
    s => s.toLowerCase(),
    s => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase(),
    s => s.replace(/[^\d.]/g, ''),
    s => s.replace(/[^a-zA-Z\s]/g, '').trim(),
    s => s.split(/[\s-_]+/).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' '),
    s => s.split(' ').reverse().join(' '),
    s => s.split('@')[0] ?? s,
    s => s.split(' ').pop() ?? s,
    s => s.split(' ')[0] ?? s,
  ];
  const matches: number[] = [];
  for (const t of transforms) {
    let ok = true;
    for (let i = 0; i < Math.min(examples.length, targets.length); i++) {
      if (t(targets[i]) !== examples[i]) { ok = false; break; }
    }
    if (ok) matches.push(transforms.indexOf(t));
  }
  if (!matches.length) return targets;
  const fn = transforms[matches[0]];
  return targets.map(fn);
}

export function colorDistanceLab(c1: [number, number, number], c2: [number, number, number]): number {
  const dl = c1[0] - c2[0], da = c1[1] - c2[1], db = c1[2] - c2[2];
  return Math.sqrt(dl * dl + da * da + db * db);
}

export function rgbToLab([r, g, b]: [number, number, number]): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  r = r > 0.04045 ? Math.pow((r + 0.055) / 1.055, 2.4) : r / 12.92;
  g = g > 0.04045 ? Math.pow((g + 0.055) / 1.055, 2.4) : g / 12.92;
  b = b > 0.04045 ? Math.pow((b + 0.055) / 1.055, 2.4) : b / 12.92;
  let x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047;
  let y = (r * 0.2126 + g * 0.7152 + b * 0.0722);
  let z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883;
  x = x > 0.008856 ? Math.pow(x, 1 / 3) : 7.787 * x + 16 / 116;
  y = y > 0.008856 ? Math.pow(y, 1 / 3) : 7.787 * y + 16 / 116;
  z = z > 0.008856 ? Math.pow(z, 1 / 3) : 7.787 * z + 16 / 116;
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

export function colorMatchCanvas(src: HTMLCanvasElement, reference: HTMLCanvasElement, strength = 0.8): HTMLCanvasElement {
  const w = src.width, h = src.height;
  const out = blankCanvas(w, h);
  const ctx = out.getContext('2d')!;
  ctx.drawImage(src, 0, 0);
  const img = ctx.getImageData(0, 0, w, h);
  const data = img.data;

  const refCtx = reference.getContext('2d')!;
  const refData = refCtx.getImageData(0, 0, reference.width, reference.height).data;
  const stats = (d: Uint8ClampedArray) => {
    let r = 0, g = 0, b = 0, rs = 0, gs = 0, bs = 0, n = 0;
    const stride = Math.max(4, Math.floor(d.length / 4 / 20000) * 4);
    for (let i = 0; i < d.length; i += stride) {
      r += d[i]; g += d[i + 1]; b += d[i + 2]; n++;
    }
    r /= n; g /= n; b /= n;
    for (let i = 0; i < d.length; i += stride) {
      rs += (d[i] - r) ** 2; gs += (d[i + 1] - g) ** 2; bs += (d[i + 2] - b) ** 2;
    }
    return { r, g, b, rs: Math.sqrt(rs / n), gs: Math.sqrt(gs / n), bs: Math.sqrt(bs / n) };
  };
  const sStat = stats(data);
  const rStat = stats(refData);
  const adj = (v: number, sm: number, ss: number, rm: number, rs: number) => {
    const z = (v - sm) / Math.max(1, ss);
    const t = rm + z * Math.max(1, rs);
    return v * (1 - strength) + t * strength;
  };
  for (let i = 0; i < data.length; i += 4) {
    data[i] = Math.max(0, Math.min(255, adj(data[i], sStat.r, sStat.rs, rStat.r, rStat.rs)));
    data[i + 1] = Math.max(0, Math.min(255, adj(data[i + 1], sStat.g, sStat.gs, rStat.g, rStat.gs)));
    data[i + 2] = Math.max(0, Math.min(255, adj(data[i + 2], sStat.b, sStat.bs, rStat.b, rStat.bs)));
  }
  ctx.putImageData(img, 0, 0);
  return out;
}

export function broadcastChain(buffer: AudioBuffer, opts: { normalizeLUFS?: number } = {}): { targetGainDb: number; deessFreq: number; compThreshold: number } {
  const targetLUFS = opts.normalizeLUFS ?? -16;
  const currentDb = loudnessRMSdB(buffer);
  const targetGainDb = Math.max(-12, Math.min(20, targetLUFS - currentDb));
  return { targetGainDb, deessFreq: 6500, compThreshold: -18 };
}

export function deEss(buffer: AudioBuffer, opts: { freq?: number; amount?: number } = {}): AudioBuffer {
  const sr = buffer.sampleRate;
  const f = opts.freq ?? 6500;
  const amount = Math.max(0, Math.min(1, opts.amount ?? 0.6));
  const out = new (window.AudioContext || (window as any).webkitAudioContext)().createBuffer(buffer.numberOfChannels, buffer.length, sr);
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const src = buffer.getChannelData(c);
    const dst = out.getChannelData(c);
    const wc = 2 * Math.PI * f / sr;
    const cosW = Math.cos(wc), sinW = Math.sin(wc);
    const Q = 1.2;
    const alpha = sinW / (2 * Q);
    const A = Math.pow(10, -amount * 8 / 40);
    const b0 = 1 + alpha * A, b1 = -2 * cosW, b2 = 1 - alpha * A;
    const a0 = 1 + alpha / A, a1 = -2 * cosW, a2 = 1 - alpha / A;
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let i = 0; i < src.length; i++) {
      const y = (b0 / a0) * src[i] + (b1 / a0) * x1 + (b2 / a0) * x2 - (a1 / a0) * y1 - (a2 / a0) * y2;
      dst[i] = y;
      x2 = x1; x1 = src[i]; y2 = y1; y1 = y;
    }
  }
  return out;
}
