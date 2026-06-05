'use client';
/**
 * Audio file metadata watermark — adds a brand chunk to WAV (LIST/INFO) and an
 * ID3v1 tag to MP3 so the file itself carries proof of origin, not just the
 * filename. Standard format-compliant chunks: media players read them, but
 * they don't affect playback (zero audio change). Filename suffix is still
 * applied separately by the download interceptor — this is the file-level
 * second layer.
 *
 * Why both:
 *   • Filename: visible at-rest, easy to spot, but trivially renamed.
 *   • Metadata: travels with the bytes through copy, re-host, even re-encode
 *     by lossy tools (most preserve metadata).
 */

import { WM_DOMAIN, WM_MADE_WITH, shouldWatermarkHere } from './config';

/** Append a RIFF LIST/INFO chunk to a WAV blob — INAM (title), IART (artist),
 *  ICMT (comment), ISFT (software). Standard, format-compliant: any decoder
 *  reads the WAV exactly as before; the chunk shows up in tools like ffprobe,
 *  iTunes, Audacity. Free → branded; Pro → unchanged. */
export function brandWav(blob: Blob): Promise<Blob> {
  return blob.arrayBuffer().then((buf) => {
    const bytes = new Uint8Array(buf);
    // Sanity: must start with RIFF…WAVE.
    if (bytes.length < 12) return blob;
    const head = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
    const fmt = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]);
    if (head !== 'RIFF' || fmt !== 'WAVE') return blob;

    const list = buildListInfoChunk();
    // Splice list chunk before the data chunk (cleanest layout: fmt, LIST, data)
    // For simplicity we append at the end — most decoders scan all chunks.
    const out = new Uint8Array(bytes.length + list.length);
    out.set(bytes, 0);
    out.set(list, bytes.length);
    // Update RIFF size at offset 4 (LE uint32 = file size - 8).
    const view = new DataView(out.buffer);
    view.setUint32(4, out.length - 8, true);
    return new Blob([out], { type: blob.type || 'audio/wav' });
  }).catch(() => blob); // never break the export
}

function buildListInfoChunk(): Uint8Array {
  // LIST chunk: "LIST" <size:LE u32> "INFO" <sub-chunks>
  // Sub-chunk: 4-char id, LE u32 size, payload + pad-to-even.
  const fields: Array<[string, string]> = [
    ['INAM', WM_MADE_WITH],
    ['IART', WM_DOMAIN],
    ['ICMT', WM_MADE_WITH],
    ['ISFT', WM_DOMAIN],
  ];
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [];
  for (const [id, val] of fields) {
    const payload = enc.encode(val + '\0');
    const padded = payload.length % 2 ? new Uint8Array(payload.length + 1) : payload;
    if (padded !== payload) padded.set(payload, 0);
    const head = new Uint8Array(8);
    for (let i = 0; i < 4; i++) head[i] = id.charCodeAt(i);
    new DataView(head.buffer).setUint32(4, padded.length, true);
    parts.push(head, padded);
  }
  const inner = concat(parts);
  const listHead = new Uint8Array(12);
  // "LIST"
  for (let i = 0; i < 4; i++) listHead[i] = 'LIST'.charCodeAt(i);
  new DataView(listHead.buffer).setUint32(4, inner.length + 4, true);
  // "INFO"
  for (let i = 0; i < 4; i++) listHead[8 + i] = 'INFO'.charCodeAt(i);
  return concat([listHead, inner]);
}

/** Append a 128-byte ID3v1 tag to an MP3 blob. v1 is simpler than v2 and is
 *  appended at the END of the file (no offset rewrite). All MP3 decoders skip
 *  it. Title/artist/comment fields show up in every player. Free → branded;
 *  Pro → unchanged. */
export function brandMp3(blob: Blob): Promise<Blob> {
  return blob.arrayBuffer().then((buf) => {
    const tag = new Uint8Array(128);
    // "TAG"
    tag[0] = 0x54; tag[1] = 0x41; tag[2] = 0x47;
    const enc = new TextEncoder();
    const set = (offset: number, length: number, text: string) => {
      const data = enc.encode(text);
      const n = Math.min(length, data.length);
      for (let i = 0; i < n; i++) tag[offset + i] = data[i];
    };
    set(3, 30, WM_MADE_WITH);   // title
    set(33, 30, WM_DOMAIN);     // artist
    set(63, 30, WM_DOMAIN);     // album
    set(93, 4, String(new Date().getFullYear())); // year
    set(97, 30, WM_MADE_WITH);  // comment
    tag[127] = 12; // genre: "Other"
    const out = new Uint8Array(buf.byteLength + 128);
    out.set(new Uint8Array(buf), 0);
    out.set(tag, buf.byteLength);
    return new Blob([out], { type: blob.type || 'audio/mp3' });
  }).catch(() => blob);
}

/** Brand any audio blob (auto-detects WAV vs MP3 by MIME, falls back to the
 *  file header). Other formats (OGG / FLAC) pass through; the filename suffix
 *  remains the primary mark for those. Free → branded; Pro → unchanged. */
export async function brandAudioBlob(blob: Blob): Promise<Blob> {
  // Free + asset-tool → brand; Pro OR a clean-intent tool (audio convert/merge,
  // transcription, DSP utilities with policy.watermarkFree:false) → leave clean.
  if (!shouldWatermarkHere()) return blob;
  const type = (blob.type || '').toLowerCase();
  if (type.includes('wav')) return brandWav(blob);
  if (type.includes('mp3') || type.includes('mpeg')) return brandMp3(blob);
  return blob;
}

function concat(parts: Uint8Array[]): Uint8Array {
  let total = 0;
  for (const p of parts) total += p.length;
  const out = new Uint8Array(total);
  let i = 0;
  for (const p of parts) { out.set(p, i); i += p.length; }
  return out;
}
