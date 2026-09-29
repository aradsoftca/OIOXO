/**
 * WOFF 1.0 ⇄ SFNT (TrueType .ttf / OpenType .otf), per the W3C WOFF spec.
 * WOFF is the same tables, each zlib-compressed, behind a 44-byte header — so
 * both directions are lossless table copies (fflate does the zlib part).
 * WOFF2 (Brotli + table transforms) is NOT handled here.
 */
import { unzlibSync, zlibSync } from 'fflate';

const WOFF = 0x774f4646;          // 'wOFF'
const WOFF2 = 0x774f4632;         // 'wOF2'
const OTTO = 0x4f54544f;          // 'OTTO' — CFF outlines
const align4 = (n: number): number => (n + 3) & ~3;

export type SfntFlavor = 'ttf' | 'otf';

export function sniffFont(bytes: Uint8Array): 'woff' | 'woff2' | SfntFlavor | null {
  if (bytes.length < 4) return null;
  const sig = new DataView(bytes.buffer, bytes.byteOffset, 4).getUint32(0);
  if (sig === WOFF) return 'woff';
  if (sig === WOFF2) return 'woff2';
  if (sig === OTTO) return 'otf';
  if (sig === 0x00010000 || sig === 0x74727565 /* 'true' */) return 'ttf';
  return null;
}

function checksum(b: Uint8Array, off: number, len: number): number {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let sum = 0;
  const end = off + align4(len);
  for (let p = off; p < end; p += 4) sum = (sum + (p + 4 <= b.length ? dv.getUint32(p) : 0)) >>> 0;
  return sum;
}

interface Table { tag: number; data: Uint8Array; checksum: number }

function writeSfnt(flavor: number, tables: Table[]): Uint8Array {
  const n = tables.length;
  let size = 12 + 16 * n;
  for (const t of tables) size += align4(t.data.length);
  const out = new Uint8Array(size);
  const dv = new DataView(out.buffer);
  const maxPow2 = 2 ** Math.floor(Math.log2(n || 1));
  dv.setUint32(0, flavor);
  dv.setUint16(4, n);
  dv.setUint16(6, maxPow2 * 16);
  dv.setUint16(8, Math.log2(maxPow2));
  dv.setUint16(10, n * 16 - maxPow2 * 16);
  let off = 12 + 16 * n;
  let headOff = -1;
  tables.forEach((t, i) => {
    const r = 12 + i * 16;
    dv.setUint32(r, t.tag);
    dv.setUint32(r + 4, t.checksum);
    dv.setUint32(r + 8, off);
    dv.setUint32(r + 12, t.data.length);
    out.set(t.data, off);
    if (t.tag === 0x68656164 /* 'head' */) headOff = off;
    off += align4(t.data.length);
  });
  // head.checkSumAdjustment = 0xB1B0AFBA − checksum of the whole font (with the field zeroed).
  if (headOff >= 0 && headOff + 12 <= out.length) {
    dv.setUint32(headOff + 8, 0);
    dv.setUint32(headOff + 8, (0xb1b0afba - checksum(out, 0, out.length)) >>> 0);
  }
  return out;
}

/** WOFF → the original TrueType/OpenType font. */
export function woffToSfnt(bytes: Uint8Array): { font: Uint8Array; flavor: SfntFlavor } {
  const kind = sniffFont(bytes);
  if (kind === 'woff2') throw new Error('This is a WOFF2 font; only WOFF 1.0 can be converted here.');
  if (kind !== 'woff') throw new Error('Not a WOFF font (missing the wOFF signature).');
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const flavor = dv.getUint32(4);
  const n = dv.getUint16(12);
  const tables: Table[] = [];
  for (let i = 0; i < n; i++) {
    const e = 44 + i * 20;
    const tag = dv.getUint32(e);
    const off = dv.getUint32(e + 4);
    const compLen = dv.getUint32(e + 8);
    const origLen = dv.getUint32(e + 12);
    const sum = dv.getUint32(e + 16);
    if (off + compLen > bytes.length) throw new Error('Truncated WOFF font.');
    const raw = bytes.subarray(off, off + compLen);
    const data = compLen < origLen ? unzlibSync(raw) : raw.slice();
    if (data.length !== origLen) throw new Error('Corrupt WOFF table (size mismatch after decompression).');
    tables.push({ tag, data, checksum: sum });
  }
  tables.sort((a, b) => a.tag - b.tag);
  return { font: writeSfnt(flavor, tables), flavor: flavor === OTTO ? 'otf' : 'ttf' };
}

/** TrueType/OpenType → WOFF 1.0 (each table zlib-compressed when that helps). */
export function sfntToWoff(bytes: Uint8Array): Uint8Array {
  const kind = sniffFont(bytes);
  if (kind !== 'ttf' && kind !== 'otf') throw new Error('Not a TrueType/OpenType font.');
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const flavor = dv.getUint32(0);
  const n = dv.getUint16(4);
  const entries: { tag: number; sum: number; orig: Uint8Array; comp: Uint8Array }[] = [];
  let totalSfnt = 12 + 16 * n;
  let major = 1, minor = 0;
  for (let i = 0; i < n; i++) {
    const r = 12 + i * 16;
    const tag = dv.getUint32(r);
    const off = dv.getUint32(r + 8);
    const len = dv.getUint32(r + 12);
    if (off + len > bytes.length) throw new Error('Truncated font file.');
    const orig = bytes.subarray(off, off + len);
    const z = zlibSync(orig, { level: 9 });
    entries.push({ tag, sum: dv.getUint32(r + 4), orig, comp: z.length < orig.length ? z : orig });
    totalSfnt += align4(len);
    if (tag === 0x68656164 && len >= 8) { major = dv.getUint16(off + 4); minor = dv.getUint16(off + 6); }
  }
  entries.sort((a, b) => a.tag - b.tag);
  let size = 44 + 20 * n;
  for (const e of entries) size += align4(e.comp.length);
  const out = new Uint8Array(size);
  const o = new DataView(out.buffer);
  o.setUint32(0, WOFF);
  o.setUint32(4, flavor);
  o.setUint32(8, size);
  o.setUint16(12, n);
  o.setUint32(16, totalSfnt);
  o.setUint16(20, major);
  o.setUint16(22, minor);
  let off = 44 + 20 * n;
  entries.forEach((e, i) => {
    const d = 44 + i * 20;
    o.setUint32(d, e.tag);
    o.setUint32(d + 4, off);
    o.setUint32(d + 8, e.comp.length);
    o.setUint32(d + 12, e.orig.length);
    o.setUint32(d + 16, e.sum);
    out.set(e.comp, off);
    off += align4(e.comp.length);
  });
  return out;
}
