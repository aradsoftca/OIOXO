/**
 * Windows animated cursor (.ani) — pure parsing, no DOM.
 *
 *   RIFF <size> 'ACON'
 *     'anih'  header (frame count, steps, default rate in jiffies, flags)
 *     'rate'  optional per-step display time (jiffies = 1/60 s)
 *     'seq '  optional per-step frame index
 *     'LIST' 'fram'  →  'icon' chunks, each a complete ICO/CUR file
 *
 * Each frame is decoded to RGBA here when it is a DIB (the usual case); PNG
 * entries (Vista-style 256px icons) are handed back as PNG bytes for the
 * browser to decode.
 */

export interface AniHeader {
  frames: number;
  steps: number;
  width: number;
  height: number;
  /** Default display time per step, in jiffies (1/60 s). */
  rate: number;
  /** AF_ICON: frames are ICO/CUR files (otherwise raw bitmaps, unsupported). */
  iconFrames: boolean;
}

export interface AniFile {
  header: AniHeader;
  /** Raw ICO/CUR bytes of each frame, in file order. */
  frames: Uint8Array[];
  /** Frame index shown at each step. */
  sequence: number[];
  /** Display time of each step in jiffies. */
  rates: number[];
}

const td = new TextDecoder('latin1');
const tag = (b: Uint8Array, o: number): string => td.decode(b.subarray(o, o + 4));

export function isAni(bytes: Uint8Array): boolean {
  return bytes.length >= 12 && tag(bytes, 0) === 'RIFF' && tag(bytes, 8) === 'ACON';
}

export function parseAni(bytes: Uint8Array): AniFile {
  if (!isAni(bytes)) throw new Error('Not an animated cursor: the file has no RIFF/ACON header.');
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let header: AniHeader | null = null;
  const frames: Uint8Array[] = [];
  let rates: number[] | null = null;
  let seq: number[] | null = null;

  const walk = (start: number, end: number): void => {
    let o = start;
    while (o + 8 <= end) {
      const id = tag(bytes, o);
      const size = dv.getUint32(o + 4, true);
      const body = o + 8;
      const bodyEnd = Math.min(end, body + size);
      if (id === 'anih' && size >= 36) {
        const flags = dv.getUint32(body + 32, true);
        header = {
          frames: dv.getUint32(body + 4, true),
          steps: dv.getUint32(body + 8, true),
          width: dv.getUint32(body + 12, true),
          height: dv.getUint32(body + 16, true),
          rate: dv.getUint32(body + 28, true) || 10,
          iconFrames: (flags & 1) === 1,
        };
      } else if (id === 'rate') {
        rates = [];
        for (let p = body; p + 4 <= bodyEnd; p += 4) rates.push(dv.getUint32(p, true));
      } else if (id === 'seq ') {
        seq = [];
        for (let p = body; p + 4 <= bodyEnd; p += 4) seq.push(dv.getUint32(p, true));
      } else if (id === 'LIST' && size >= 4) {
        walk(body + 4, bodyEnd);          // 'fram' / 'INFO' — descend; only 'icon' is kept
      } else if (id === 'icon') {
        frames.push(bytes.subarray(body, bodyEnd));
      }
      o = body + size + (size & 1);       // RIFF chunks are word-aligned
    }
  };
  walk(12, bytes.length);

  if (!header) throw new Error('Broken animated cursor: no "anih" header chunk.');
  const h: AniHeader = header;
  if (!h.iconFrames) throw new Error('This .ani stores raw bitmaps instead of icon frames, which is not supported.');
  if (!frames.length) throw new Error('This .ani contains no frames.');
  const steps = (seq as number[] | null)?.length ?? (h.steps || frames.length);
  const sequence = (seq as number[] | null) ?? Array.from({ length: steps }, (_, i) => i % frames.length);
  const r = rates as number[] | null;
  return {
    header: h,
    frames,
    sequence: sequence.map((i) => (i < frames.length ? i : 0)),
    rates: sequence.map((_, i) => (r && r[i] ? r[i] : h.rate)),
  };
}

// --- ICO / CUR -------------------------------------------------------------

export interface IcoEntry {
  width: number;
  height: number;
  bitCount: number;
  /** For CUR files the hotspot, for ICO planes/bitCount are stored here. */
  hotspotX: number;
  hotspotY: number;
  data: Uint8Array;
}

export interface IcoFile {
  /** 1 = icon, 2 = cursor. */
  type: number;
  entries: IcoEntry[];
}

export function parseIco(bytes: Uint8Array): IcoFile {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 6 || dv.getUint16(0, true) !== 0) throw new Error('Frame is not an ICO/CUR image.');
  const type = dv.getUint16(2, true);
  const count = dv.getUint16(4, true);
  const entries: IcoEntry[] = [];
  for (let i = 0; i < count; i++) {
    const e = 6 + i * 16;
    if (e + 16 > bytes.length) break;
    const size = dv.getUint32(e + 8, true);
    const off = dv.getUint32(e + 12, true);
    if (off + size > bytes.length) continue;
    const data = bytes.subarray(off, off + size);
    const f1 = dv.getUint16(e + 4, true);
    const f2 = dv.getUint16(e + 6, true);
    entries.push({
      width: bytes[e] || 256,
      height: bytes[e + 1] || 256,
      bitCount: type === 1 && f2 ? f2 : dibBitCount(data),
      hotspotX: type === 2 ? f1 : 0,
      hotspotY: type === 2 ? f2 : 0,
      data,
    });
  }
  if (!entries.length) throw new Error('Frame has no images.');
  return { type, entries };
}

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47];
export const isPng = (d: Uint8Array): boolean => PNG_SIG.every((b, i) => d[i] === b);

function dibBitCount(d: Uint8Array): number {
  if (isPng(d) || d.length < 16) return 32;
  return d[14] | (d[15] << 8);
}

/** Largest, deepest image in the file. */
export function bestEntry(ico: IcoFile): IcoEntry {
  return [...ico.entries].sort((a, b) => b.width * b.height - a.width * a.height || b.bitCount - a.bitCount)[0];
}

export type DecodedFrame =
  | { kind: 'rgba'; width: number; height: number; rgba: Uint8ClampedArray<ArrayBuffer> }
  | { kind: 'png'; png: Uint8Array };

/** Decode an ICO/CUR image entry (BITMAPINFOHEADER DIB, 1/4/8/24/32 bpp, or embedded PNG). */
export function decodeEntry(entry: IcoEntry): DecodedFrame {
  const d = entry.data;
  if (isPng(d)) return { kind: 'png', png: d };
  const dv = new DataView(d.buffer, d.byteOffset, d.byteLength);
  const hdr = dv.getUint32(0, true);
  if (hdr < 40) throw new Error('Unsupported cursor bitmap header.');
  const w = dv.getInt32(4, true);
  const h = Math.abs(dv.getInt32(8, true)) >> 1;   // height covers XOR + AND masks
  const bpp = dv.getUint16(14, true);
  const compression = dv.getUint32(16, true);
  if (compression !== 0 && compression !== 3) throw new Error('Compressed cursor bitmaps are not supported.');
  if (![1, 4, 8, 24, 32].includes(bpp)) throw new Error(`Unsupported cursor bit depth: ${bpp}.`);
  const clrUsed = dv.getUint32(32, true);
  let p = hdr + (compression === 3 && hdr === 40 ? 12 : 0);
  const palette: number[][] = [];
  if (bpp <= 8) {
    const n = clrUsed || 1 << bpp;
    for (let i = 0; i < n; i++, p += 4) palette.push([d[p + 2], d[p + 1], d[p]]);
  }
  const xorStride = ((w * bpp + 31) >> 5) << 2;
  const andStride = ((w + 31) >> 5) << 2;
  const xorStart = p;
  const andStart = xorStart + xorStride * h;
  const rgba = new Uint8ClampedArray(w * h * 4);
  let anyAlpha = false;
  for (let y = 0; y < h; y++) {
    const row = xorStart + (h - 1 - y) * xorStride;   // bottom-up
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      let r = 0, g = 0, b = 0, a = 255;
      if (bpp === 32) { b = d[row + x * 4]; g = d[row + x * 4 + 1]; r = d[row + x * 4 + 2]; a = d[row + x * 4 + 3]; if (a) anyAlpha = true; }
      else if (bpp === 24) { b = d[row + x * 3]; g = d[row + x * 3 + 1]; r = d[row + x * 3 + 2]; }
      else {
        const bit = x * bpp;
        const byte = d[row + (bit >> 3)] ?? 0;
        const idx = (byte >> (8 - bpp - (bit & 7))) & ((1 << bpp) - 1);
        [r, g, b] = palette[idx] ?? [0, 0, 0];
      }
      rgba[o] = r; rgba[o + 1] = g; rgba[o + 2] = b; rgba[o + 3] = a;
    }
  }
  // Below 32 bpp (or a 32 bpp image with an all-zero alpha channel) the AND mask is the transparency.
  if (bpp !== 32 || !anyAlpha) {
    for (let y = 0; y < h; y++) {
      const row = andStart + (h - 1 - y) * andStride;
      if (row + andStride > d.length) break;
      for (let x = 0; x < w; x++) {
        const masked = (d[row + (x >> 3)] >> (7 - (x & 7))) & 1;
        rgba[(y * w + x) * 4 + 3] = masked ? 0 : 255;
      }
    }
  }
  return { kind: 'rgba', width: w, height: h, rgba };
}

/**
 * Re-save one frame as a standalone .ico (type 1) or .cur (type 2). The image
 * data is copied byte for byte; only the directory fields that differ between
 * the two formats are rewritten (planes/bit depth vs. hotspot).
 */
export function frameToIcoCur(frame: Uint8Array, as: 'ico' | 'cur'): Uint8Array {
  const ico = parseIco(frame);
  const out = frame.slice();
  const dv = new DataView(out.buffer);
  dv.setUint16(2, as === 'ico' ? 1 : 2, true);
  ico.entries.forEach((e, i) => {
    const o = 6 + i * 16;
    if (as === 'ico') { dv.setUint16(o + 4, 1, true); dv.setUint16(o + 6, e.bitCount, true); }
    else { dv.setUint16(o + 4, e.hotspotX, true); dv.setUint16(o + 6, e.hotspotY, true); }
  });
  return out;
}
