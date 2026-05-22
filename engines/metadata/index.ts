/**
 * Metadata strip — removes EXIF / GPS / XMP / IPTC / comment data from images.
 *
 * JPEG and PNG are stripped LOSSLESSLY by rewriting the container and dropping
 * only the metadata segments/chunks — the pixel data is byte-for-byte untouched
 * and colour profiles (ICC) are preserved. Other formats fall back to a canvas
 * re-encode, which also drops metadata.
 *
 * Reading (for the "what was found" preview) uses exifr.
 */

const JPEG = [0xff, 0xd8];

/** Drop APP1 (Exif/XMP), APP13 (IPTC/Photoshop) and COM (comments) from a JPEG. */
function stripJpeg(bytes: Uint8Array): Uint8Array {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new Error('Not a JPEG');
  const out: number[] = [...JPEG];
  let i = 2;
  while (i < bytes.length - 1) {
    if (bytes[i] !== 0xff) break;
    const marker = bytes[i + 1];
    // Start of Scan: copy the rest (entropy-coded image data) verbatim.
    if (marker === 0xda) { for (let j = i; j < bytes.length; j++) out.push(bytes[j]); return new Uint8Array(out); }
    // Standalone markers without a length payload.
    if (marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) { out.push(0xff, marker); i += 2; continue; }
    const len = (bytes[i + 2] << 8) | bytes[i + 3];
    const drop = marker === 0xe1 /* APP1 Exif/XMP */ || marker === 0xed /* APP13 IPTC */ || marker === 0xfe /* COM */;
    if (!drop) for (let j = i; j < i + 2 + len; j++) out.push(bytes[j]);
    i += 2 + len;
  }
  return new Uint8Array(out);
}

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const PNG_DROP = new Set(['tEXt', 'zTXt', 'iTXt', 'eXIf', 'tIME']);

/** Drop text / EXIF / timestamp ancillary chunks from a PNG; keep colour chunks. */
function stripPng(bytes: Uint8Array): Uint8Array {
  for (let i = 0; i < 8; i++) if (bytes[i] !== PNG_SIG[i]) throw new Error('Not a PNG');
  const out: number[] = [...PNG_SIG];
  let i = 8;
  while (i < bytes.length) {
    const len = (bytes[i] << 24) | (bytes[i + 1] << 16) | (bytes[i + 2] << 8) | bytes[i + 3];
    const type = String.fromCharCode(bytes[i + 4], bytes[i + 5], bytes[i + 6], bytes[i + 7]);
    const total = 12 + len; // length(4) + type(4) + data(len) + crc(4)
    if (!PNG_DROP.has(type)) for (let j = i; j < i + total; j++) out.push(bytes[j]);
    i += total;
    if (type === 'IEND') break;
  }
  return new Uint8Array(out);
}

async function reencode(blob: Blob): Promise<Blob> {
  const bm = await createImageBitmap(blob);
  const canvas = document.createElement('canvas');
  canvas.width = bm.width; canvas.height = bm.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');
  ctx.drawImage(bm, 0, 0); bm.close();
  const type = blob.type === 'image/webp' ? 'image/webp' : 'image/png';
  return new Promise<Blob>((res, rej) => canvas.toBlob((b) => b ? res(b) : rej(new Error('encode failed')), type, 0.95));
}

export interface StripResult { blob: Blob; lossless: boolean; outBytes: number }

export async function stripMetadata(file: File): Promise<StripResult> {
  const buf = new Uint8Array(await file.arrayBuffer());
  const isJpeg = buf[0] === 0xff && buf[1] === 0xd8;
  const isPng = PNG_SIG.every((b, i) => buf[i] === b);
  if (isJpeg) { const o = stripJpeg(buf); return { blob: new Blob([new Uint8Array(o)], { type: 'image/jpeg' }), lossless: true, outBytes: o.length }; }
  if (isPng)  { const o = stripPng(buf);  return { blob: new Blob([new Uint8Array(o)], { type: 'image/png'  }), lossless: true, outBytes: o.length }; }
  const blob = await reencode(file);
  return { blob, lossless: false, outBytes: blob.size };
}

export interface MetaSummary {
  hasGps: boolean;
  rows: { key: string; value: string }[];
}

/** Read a human-readable summary of the metadata present (for the before view). */
export async function readMetadata(file: File): Promise<MetaSummary> {
  try {
    const exifr = (await import('exifr')).default;
    const data = await exifr.parse(file).catch(() => null);
    if (!data) return { hasGps: false, rows: [] };
    const rows: { key: string; value: string }[] = [];
    const push = (k: string, v: unknown) => { if (v != null && v !== '') rows.push({ key: k, value: String(v) }); };
    const hasGps = data.latitude != null && data.longitude != null;
    if (hasGps) push('GPS location', `${Number(data.latitude).toFixed(5)}, ${Number(data.longitude).toFixed(5)}`);
    push('Camera', [data.Make, data.Model].filter(Boolean).join(' '));
    push('Lens', data.LensModel);
    push('Software', data.Software);
    push('Taken', data.DateTimeOriginal instanceof Date ? data.DateTimeOriginal.toLocaleString() : data.DateTimeOriginal);
    push('Exposure', data.ExposureTime ? `${data.ExposureTime}s` : undefined);
    push('Aperture', data.FNumber ? `f/${data.FNumber}` : undefined);
    push('ISO', data.ISO);
    push('Focal length', data.FocalLength ? `${data.FocalLength}mm` : undefined);
    return { hasGps, rows };
  } catch {
    return { hasGps: false, rows: [] };
  }
}
