/**
 * Embedded cover art from an MP3's ID3v2 tag (APIC frame; PIC in ID3v2.2).
 * Pure byte parsing — handles v2.2/2.3/2.4, syncsafe sizes, the extended
 * header and unsynchronisation. Compressed/encrypted frames are skipped.
 */

export interface CoverArt {
  data: Uint8Array;
  mime: string;
  /** ID3 picture type (3 = front cover). */
  pictureType: number;
  description: string;
}

const syncsafe = (b: Uint8Array, o: number): number => ((b[o] & 0x7f) << 21) | ((b[o + 1] & 0x7f) << 14) | ((b[o + 2] & 0x7f) << 7) | (b[o + 3] & 0x7f);
const u32 = (b: Uint8Array, o: number): number => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;

/** Undo ID3 unsynchronisation (every 0xFF 0x00 was written for 0xFF). */
function deunsync(b: Uint8Array): Uint8Array {
  const out = new Uint8Array(b.length);
  let n = 0;
  for (let i = 0; i < b.length; i++) {
    out[n++] = b[i];
    if (b[i] === 0xff && b[i + 1] === 0x00) i++;
  }
  return out.subarray(0, n);
}

function sniffMime(d: Uint8Array, declared: string): string {
  if (d[0] === 0xff && d[1] === 0xd8) return 'image/jpeg';
  if (d[0] === 0x89 && d[1] === 0x50 && d[2] === 0x4e && d[3] === 0x47) return 'image/png';
  if (d[0] === 0x47 && d[1] === 0x49 && d[2] === 0x46) return 'image/gif';
  if (d[0] === 0x42 && d[1] === 0x4d) return 'image/bmp';
  if (d[8] === 0x57 && d[9] === 0x45 && d[10] === 0x42 && d[11] === 0x50) return 'image/webp';
  const m = declared.toLowerCase();
  return m === 'jpg' || m === 'image/jpg' ? 'image/jpeg' : m === 'png' ? 'image/png' : m;
}

/** Index just past a text terminator for the given ID3 text encoding. */
function afterTerminator(b: Uint8Array, from: number, enc: number): number {
  if (enc === 1 || enc === 2) {
    for (let i = from; i + 1 < b.length; i += 2) if (b[i] === 0 && b[i + 1] === 0) return i + 2;
    return b.length;
  }
  const i = b.indexOf(0, from);
  return i < 0 ? b.length : i + 1;
}

function decodeText(b: Uint8Array, enc: number): string {
  const label = enc === 1 ? 'utf-16' : enc === 2 ? 'utf-16be' : enc === 3 ? 'utf-8' : 'latin1';
  return new TextDecoder(label).decode(b).replace(/\0+$/, '');
}

function parsePicture(frame: Uint8Array, v22: boolean): CoverArt | null {
  if (frame.length < 4) return null;
  const enc = frame[0];
  let p = 1;
  let mime: string;
  if (v22) { mime = new TextDecoder('latin1').decode(frame.subarray(1, 4)); p = 4; }
  else { const end = afterTerminator(frame, 1, 0); mime = new TextDecoder('latin1').decode(frame.subarray(1, end - 1)); p = end; }
  const pictureType = frame[p++];
  const descEnd = afterTerminator(frame, p, enc);
  const description = decodeText(frame.subarray(p, Math.max(p, descEnd - (enc === 1 || enc === 2 ? 2 : 1))), enc);
  const data = frame.subarray(descEnd);
  if (!data.length) return null;
  return { data, mime: sniffMime(data, mime), pictureType, description };
}

/** All pictures in the tag, front cover first. Empty when the file has none. */
export function extractPictures(bytes: Uint8Array): CoverArt[] {
  if (bytes.length < 10 || bytes[0] !== 0x49 || bytes[1] !== 0x44 || bytes[2] !== 0x33) return [];
  const ver = bytes[3];
  if (ver < 2 || ver > 4) return [];
  const flags = bytes[5];
  const tagSize = syncsafe(bytes, 6);
  let tag = bytes.subarray(10, Math.min(bytes.length, 10 + tagSize));
  if (flags & 0x80 && ver < 4) tag = deunsync(tag);          // v2.2/2.3: whole-tag unsync
  let p = 0;
  if (flags & 0x40 && ver >= 3) p = ver === 4 ? syncsafe(tag, 0) : u32(tag, 0) + 4;   // extended header

  const pics: CoverArt[] = [];
  const idLen = ver === 2 ? 3 : 4;
  const hdrLen = ver === 2 ? 6 : 10;
  while (p + hdrLen <= tag.length) {
    const id = String.fromCharCode(...tag.subarray(p, p + idLen));
    if (!/^[A-Z0-9]+$/.test(id)) break;                        // padding
    const size = ver === 2 ? (tag[p + 3] << 16) | (tag[p + 4] << 8) | tag[p + 5]
      : ver === 4 ? syncsafe(tag, p + 4) : u32(tag, p + 4);
    const fflags = ver === 2 ? 0 : tag[p + 9];
    let body = tag.subarray(p + hdrLen, Math.min(tag.length, p + hdrLen + size));
    p += hdrLen + size;
    if (id !== 'APIC' && id !== 'PIC') continue;
    if (ver === 3 && fflags & 0xc0) continue;                  // compressed / encrypted
    if (ver === 4) {
      if (fflags & 0x0c) continue;                             // compressed / encrypted
      if (fflags & 0x01) body = body.subarray(4);              // data length indicator
      if (fflags & 0x02 || flags & 0x80) body = deunsync(body);
    }
    const pic = parsePicture(body, ver === 2);
    if (pic) pics.push(pic);
  }
  return pics.sort((a, b) => Number(b.pictureType === 3) - Number(a.pictureType === 3));
}
