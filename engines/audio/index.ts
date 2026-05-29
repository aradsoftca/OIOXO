/**
 * Audio engine — pure Web Audio API operations on AudioBuffer.
 *
 * - Decoding: relies on browser AudioContext.decodeAudioData (supports MP3, M4A, OGG, WAV, FLAC on most browsers).
 * - Encoding: WAV (always, no deps) and MP3 (via @breezystack/lamejs).
 * - Operations: trim, concat, gain, fade, normalize, speed, reverse, mono/stereo.
 */

import * as dsp from './dsp';
import { watermarkOnSync, WM_DOMAIN, WM_MADE_WITH } from '@/lib/watermark/config';

let _ctx: AudioContext | null = null;
function ctx(): AudioContext {
  if (!_ctx) _ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
  return _ctx;
}

export interface AudioInfo {
  duration: number;
  sampleRate: number;
  channels: number;
  fileSize: number;
}

export async function decode(buffer: ArrayBuffer): Promise<AudioBuffer> {
  // Some browsers consume the buffer; clone first.
  return ctx().decodeAudioData(buffer.slice(0));
}

export function getInfo(ab: AudioBuffer, fileSize = 0): AudioInfo {
  return {
    duration: ab.duration,
    sampleRate: ab.sampleRate,
    channels: ab.numberOfChannels,
    fileSize,
  };
}

function newBuffer(channels: number, length: number, sampleRate: number): AudioBuffer {
  return ctx().createBuffer(channels, Math.max(1, Math.round(length)), sampleRate);
}

export function trim(ab: AudioBuffer, startSec: number, endSec: number): AudioBuffer {
  const s = Math.max(0, Math.floor(startSec * ab.sampleRate));
  const e = Math.min(ab.length, Math.floor(endSec * ab.sampleRate));
  const len = Math.max(1, e - s);
  const out = newBuffer(ab.numberOfChannels, len, ab.sampleRate);
  for (let c = 0; c < ab.numberOfChannels; c++) {
    out.copyToChannel(ab.getChannelData(c).subarray(s, e), c);
  }
  return out;
}

export function concat(buffers: AudioBuffer[]): AudioBuffer {
  if (buffers.length === 0) throw new Error('Need at least one buffer.');
  const sr = buffers[0].sampleRate;
  const channels = Math.max(...buffers.map((b) => b.numberOfChannels));
  // Size the output using the RESAMPLED length, not the raw source length —
  // without this, a 44.1kHz buffer concat'd into a 48kHz target wrote
  // length*1.088 samples into length-sized space, overflowing into the next
  // file's region (or off the end entirely).
  const totalLen = buffers.reduce((s, b) => s + Math.round(b.length * (sr / b.sampleRate)), 0);
  const out = newBuffer(channels, totalLen, sr);
  let offset = 0;
  for (const b of buffers) {
    const ratio = sr / b.sampleRate;
    const writeLen = Math.round(b.length * ratio);
    // Naive sample-rate handling: if mismatched, linear resample.
    for (let c = 0; c < channels; c++) {
      const src = c < b.numberOfChannels ? b.getChannelData(c) : b.getChannelData(b.numberOfChannels - 1);
      const dst = out.getChannelData(c);
      if (ratio === 1) {
        dst.set(src, offset);
      } else {
        for (let i = 0; i < writeLen; i++) {
          const j = i / ratio;
          const i0 = Math.floor(j);
          const t = j - i0;
          dst[offset + i] = (src[i0] ?? 0) * (1 - t) + (src[i0 + 1] ?? 0) * t;
        }
      }
    }
    offset += writeLen;
  }
  return out;
}

export function gain(ab: AudioBuffer, multiplier: number): AudioBuffer {
  const out = newBuffer(ab.numberOfChannels, ab.length, ab.sampleRate);
  for (let c = 0; c < ab.numberOfChannels; c++) {
    const src = ab.getChannelData(c);
    const dst = out.getChannelData(c);
    for (let i = 0; i < src.length; i++) dst[i] = clamp(src[i] * multiplier);
  }
  return out;
}

/**
 * Apply a per-channel DSP transform (from ./dsp) that may grow the signal
 * (echo/reverb tails). `extraSec` reserves room for the tail so it isn't cut.
 */
function applyDsp(ab: AudioBuffer, fn: (x: Float32Array, sr: number) => Float32Array, extraSec = 0): AudioBuffer {
  const extra = Math.round(extraSec * ab.sampleRate);
  const out = newBuffer(ab.numberOfChannels, ab.length + extra, ab.sampleRate);
  for (let c = 0; c < ab.numberOfChannels; c++) {
    const src = ab.getChannelData(c);
    const padded = extra ? (() => { const p = new Float32Array(src.length + extra); p.set(src); return p; })() : src;
    const processed = fn(padded, ab.sampleRate);
    const dst = out.getChannelData(c);
    for (let i = 0; i < dst.length; i++) dst[i] = clamp(processed[i] ?? 0);
  }
  return out;
}

export function bassBoost(ab: AudioBuffer, gainDb = 6): AudioBuffer {
  return applyDsp(ab, (x, sr) => dsp.shelf(x, sr, 'low', 200, gainDb));
}
export function trebleBoost(ab: AudioBuffer, gainDb = 6): AudioBuffer {
  return applyDsp(ab, (x, sr) => dsp.shelf(x, sr, 'high', 3500, gainDb));
}
export function echo(ab: AudioBuffer, delaySec = 0.3, decay = 0.4): AudioBuffer {
  return applyDsp(ab, (x, sr) => dsp.echo(x, sr, delaySec, decay), delaySec * 4);
}
export function reverb(ab: AudioBuffer, amount = 0.5): AudioBuffer {
  return applyDsp(ab, (x, sr) => dsp.reverb(x, sr, amount), 0.6);
}

/** Per-channel DSP that changes length (pitch/tempo) — output sized to result. */
function applyResizing(ab: AudioBuffer, fn: (x: Float32Array) => Float32Array): AudioBuffer {
  const chans: Float32Array[] = [];
  for (let c = 0; c < ab.numberOfChannels; c++) chans.push(fn(ab.getChannelData(c)));
  const len = chans[0]?.length ?? ab.length;
  const out = newBuffer(ab.numberOfChannels, len, ab.sampleRate);
  for (let c = 0; c < ab.numberOfChannels; c++) {
    const dst = out.getChannelData(c);
    const src = chans[c];
    for (let i = 0; i < dst.length; i++) dst[i] = clamp(src[i] ?? 0);
  }
  return out;
}

/** Shift pitch (in semitones) without changing duration. */
export function pitchShift(ab: AudioBuffer, semitones: number): AudioBuffer {
  return applyResizing(ab, (x) => dsp.pitchShift(x, semitones));
}
/** Change tempo (speed factor) without changing pitch. */
export function changeTempo(ab: AudioBuffer, speed: number): AudioBuffer {
  return applyResizing(ab, (x) => dsp.timeStretch(x, 1 / Math.max(0.1, speed)));
}

export function fadeIn(ab: AudioBuffer, durSec: number): AudioBuffer {
  const ramp = Math.min(ab.length, Math.floor(durSec * ab.sampleRate));
  const out = newBuffer(ab.numberOfChannels, ab.length, ab.sampleRate);
  for (let c = 0; c < ab.numberOfChannels; c++) {
    const src = ab.getChannelData(c);
    const dst = out.getChannelData(c);
    for (let i = 0; i < src.length; i++) {
      const g = i < ramp ? i / ramp : 1;
      dst[i] = clamp(src[i] * g);
    }
  }
  return out;
}

export function fadeOut(ab: AudioBuffer, durSec: number): AudioBuffer {
  const ramp = Math.min(ab.length, Math.floor(durSec * ab.sampleRate));
  const out = newBuffer(ab.numberOfChannels, ab.length, ab.sampleRate);
  for (let c = 0; c < ab.numberOfChannels; c++) {
    const src = ab.getChannelData(c);
    const dst = out.getChannelData(c);
    const rampStart = src.length - ramp;
    for (let i = 0; i < src.length; i++) {
      const g = i < rampStart ? 1 : 1 - (i - rampStart) / ramp;
      dst[i] = clamp(src[i] * g);
    }
  }
  return out;
}

/** Find peak amplitude (0..1) across all channels. */
export function peakAmplitude(ab: AudioBuffer): number {
  let peak = 0;
  for (let c = 0; c < ab.numberOfChannels; c++) {
    const d = ab.getChannelData(c);
    for (let i = 0; i < d.length; i++) {
      const v = Math.abs(d[i]);
      if (v > peak) peak = v;
    }
  }
  return peak;
}

export function normalize(ab: AudioBuffer, targetDb = -1): AudioBuffer {
  const peak = peakAmplitude(ab);
  if (peak === 0) return ab;
  const targetLin = Math.pow(10, targetDb / 20);
  return gain(ab, targetLin / peak);
}

export function reverse(ab: AudioBuffer): AudioBuffer {
  const out = newBuffer(ab.numberOfChannels, ab.length, ab.sampleRate);
  for (let c = 0; c < ab.numberOfChannels; c++) {
    const src = ab.getChannelData(c);
    const dst = out.getChannelData(c);
    for (let i = 0; i < src.length; i++) dst[i] = src[src.length - 1 - i];
  }
  return out;
}

/**
 * Change speed (and pitch — like vinyl speed). 1.0 = original, 2.0 = double speed.
 * For pitch-preserving speed change, would need SoundTouch/phase vocoder.
 */
export function changeSpeed(ab: AudioBuffer, factor: number): AudioBuffer {
  if (factor === 1) return ab;
  const newLen = Math.max(1, Math.floor(ab.length / factor));
  const out = newBuffer(ab.numberOfChannels, newLen, ab.sampleRate);
  for (let c = 0; c < ab.numberOfChannels; c++) {
    const src = ab.getChannelData(c);
    const dst = out.getChannelData(c);
    for (let i = 0; i < newLen; i++) {
      const j = i * factor;
      const j0 = Math.floor(j);
      const t = j - j0;
      dst[i] = (src[j0] ?? 0) * (1 - t) + (src[j0 + 1] ?? 0) * t;
    }
  }
  return out;
}

export function toMono(ab: AudioBuffer): AudioBuffer {
  if (ab.numberOfChannels === 1) return ab;
  const out = newBuffer(1, ab.length, ab.sampleRate);
  const dst = out.getChannelData(0);
  const n = ab.numberOfChannels;
  for (let i = 0; i < ab.length; i++) {
    let sum = 0;
    for (let c = 0; c < n; c++) sum += ab.getChannelData(c)[i];
    dst[i] = sum / n;
  }
  return out;
}

export function toStereo(ab: AudioBuffer): AudioBuffer {
  if (ab.numberOfChannels === 2) return ab;
  const out = newBuffer(2, ab.length, ab.sampleRate);
  const src = ab.getChannelData(0);
  out.getChannelData(0).set(src);
  out.getChannelData(1).set(src);
  return out;
}

/**
 * Constant-power stereo pan. `pan` is -1 (full left) .. 0 (center) .. +1 (full right).
 * Mono input is first expanded to stereo.
 */
export function pan(ab: AudioBuffer, panValue: number): AudioBuffer {
  const p = Math.max(-1, Math.min(1, panValue));
  const stereo = toStereo(ab);
  const out = newBuffer(2, stereo.length, stereo.sampleRate);
  const angle = ((p + 1) / 2) * (Math.PI / 2); // 0..PI/2
  const gainL = Math.cos(angle);
  const gainR = Math.sin(angle);
  const l = stereo.getChannelData(0);
  const r = stereo.getChannelData(1);
  const ol = out.getChannelData(0);
  const or = out.getChannelData(1);
  for (let i = 0; i < stereo.length; i++) {
    ol[i] = l[i] * gainL;
    or[i] = r[i] * gainR;
  }
  return out;
}

/**
 * Adjust stereo width via mid/side processing.
 * `width` 0 = mono, 1 = unchanged, 2 = double-wide. Mono input is returned untouched.
 */
export function stereoWidth(ab: AudioBuffer, width: number): AudioBuffer {
  if (ab.numberOfChannels < 2) return ab;
  const w = Math.max(0, Math.min(2, width));
  const out = newBuffer(2, ab.length, ab.sampleRate);
  const l = ab.getChannelData(0);
  const r = ab.getChannelData(1);
  const ol = out.getChannelData(0);
  const or = out.getChannelData(1);
  for (let i = 0; i < ab.length; i++) {
    const mid = (l[i] + r[i]) / 2;
    const side = ((l[i] - r[i]) / 2) * w;
    ol[i] = clamp(mid + side);
    or[i] = clamp(mid - side);
  }
  return out;
}

/**
 * Karaoke-style vocal removal via center-channel cancellation. Lead vocals are
 * usually panned dead-center, so they live in the stereo "mid" (L+R)/2. Removing
 * the mid leaves the instrumental. `amount` 0..1 = how much center to cancel.
 * Mono input can't be processed (nothing to cancel) and is returned untouched.
 */
export function removeVocals(ab: AudioBuffer, amount = 1): AudioBuffer {
  if (ab.numberOfChannels < 2) return ab;
  const k = Math.max(0, Math.min(1, amount));
  const out = newBuffer(2, ab.length, ab.sampleRate);
  const l = ab.getChannelData(0);
  const r = ab.getChannelData(1);
  const ol = out.getChannelData(0);
  const or = out.getChannelData(1);
  for (let i = 0; i < ab.length; i++) {
    const mid = (l[i] + r[i]) / 2;
    ol[i] = clamp(l[i] - k * mid);
    or[i] = clamp(r[i] - k * mid);
  }
  return out;
}

/**
 * Rough acapella isolation — the inverse: keep the center (where vocals sit)
 * and suppress the hard-panned sides. Output is mono. Not true stem separation,
 * but a useful zero-download approximation for center-panned vocals.
 */
export function isolateVocals(ab: AudioBuffer, amount = 1): AudioBuffer {
  const k = Math.max(0, Math.min(1, amount));
  const out = newBuffer(1, ab.length, ab.sampleRate);
  const o = out.getChannelData(0);
  if (ab.numberOfChannels < 2) { o.set(ab.getChannelData(0)); return out; }
  const l = ab.getChannelData(0);
  const r = ab.getChannelData(1);
  for (let i = 0; i < ab.length; i++) {
    const mid = (l[i] + r[i]) / 2;
    const side = Math.abs(l[i] - r[i]) / 2;
    o[i] = clamp(mid - k * side);
  }
  return out;
}

function clamp(v: number): number {
  return v < -1 ? -1 : v > 1 ? 1 : v;
}

// --- WAV encoder ---
/**
 * Sync WAV encoder used by ~17 audio tools. Embeds a RIFF LIST/INFO metadata
 * chunk with the brand on free sessions; Pro sessions get a clean header. The
 * branding is byte-level + synchronous so callers don't need to change.
 *
 * Builds: RIFF header + fmt chunk + (optional LIST/INFO chunk) + data chunk.
 * The LIST chunk goes BEFORE data so legacy decoders that stop at the data
 * chunk still see the metadata.
 */
export function encodeWav(ab: AudioBuffer): Blob {
  const channels = ab.numberOfChannels;
  const sr = ab.sampleRate;
  const len = ab.length;
  const bytesPerSample = 2;
  const blockAlign = channels * bytesPerSample;
  const byteRate = sr * blockAlign;
  const dataSize = len * blockAlign;

  // Optional LIST/INFO chunk (free → branded, Pro → none).
  const listChunk = watermarkOnSync() ? buildWavListInfo() : null;
  const listSize = listChunk ? listChunk.length : 0;

  const headerSize = 12 + 24 + listSize + 8; // RIFF+WAVE + fmt + LIST + data header
  const buf = new ArrayBuffer(headerSize + dataSize);
  const view = new DataView(buf);
  const bytes = new Uint8Array(buf);

  writeStr(view, 0, 'RIFF');
  view.setUint32(4, headerSize + dataSize - 8, true); // RIFF size = file size - 8
  writeStr(view, 8, 'WAVE');
  // fmt chunk
  writeStr(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sr, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  let cursor = 36;
  // LIST/INFO chunk (optional)
  if (listChunk) {
    bytes.set(listChunk, cursor);
    cursor += listChunk.length;
  }
  // data chunk
  writeStr(view, cursor, 'data');
  view.setUint32(cursor + 4, dataSize, true);
  cursor += 8;

  let offset = cursor;
  const tmp = new Float32Array(channels);
  for (let i = 0; i < len; i++) {
    for (let c = 0; c < channels; c++) tmp[c] = ab.getChannelData(c)[i];
    for (let c = 0; c < channels; c++) {
      const s = clamp(tmp[c]);
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      offset += 2;
    }
  }
  return new Blob([buf], { type: 'audio/wav' });
}

/** Build the LIST/INFO chunk bytes synchronously. Mirrors the async helper
 *  in lib/watermark/audio.ts but keeps encodeWav sync-only so existing
 *  callers don't have to change. */
function buildWavListInfo(): Uint8Array {
  const enc = new TextEncoder();
  const fields: Array<[string, string]> = [
    ['INAM', WM_MADE_WITH],
    ['IART', WM_DOMAIN],
    ['ICMT', WM_MADE_WITH],
    ['ISFT', WM_DOMAIN],
  ];
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
  let total = 0;
  for (const p of parts) total += p.length;
  const inner = new Uint8Array(total);
  let off = 0;
  for (const p of parts) { inner.set(p, off); off += p.length; }
  const listHead = new Uint8Array(12);
  for (let i = 0; i < 4; i++) listHead[i] = 'LIST'.charCodeAt(i);
  new DataView(listHead.buffer).setUint32(4, inner.length + 4, true);
  for (let i = 0; i < 4; i++) listHead[8 + i] = 'INFO'.charCodeAt(i);
  const out = new Uint8Array(12 + inner.length);
  out.set(listHead, 0);
  out.set(inner, 12);
  return out;
}

function writeStr(v: DataView, off: number, s: string) {
  for (let i = 0; i < s.length; i++) v.setUint8(off + i, s.charCodeAt(i));
}

// --- MP3 encoder (lamejs) ---
type LameStatic = new (channels: number, sampleRate: number, kbps: number) => {
  encodeBuffer: (left: Int16Array, right?: Int16Array) => Uint8Array;
  flush: () => Uint8Array;
};

/**
 * MP3 encode. Routes to a Web Worker when available so the heavy lamejs encode
 * never blocks the UI — every audio tool that calls this becomes non-blocking
 * with no change of its own. Falls back to the main thread if Workers aren't.
 */
export async function encodeMp3(ab: AudioBuffer, kbps = 192): Promise<Blob> {
  const raw = typeof Worker !== 'undefined'
    ? await (async () => { const { mergeAudio } = await import('@/lib/compute/audioMerge'); return mergeAudio([ab], 'mp3', kbps); })()
    : await encodeMp3Main(ab, kbps);
  // Apply file-level brand watermark (ID3v1 tag) on free sessions. Pro → unchanged.
  try {
    const { brandAudioBlob } = await import('@/lib/watermark/audio');
    return await brandAudioBlob(raw);
  } catch { return raw; }
}

/** Branded WAV variant. Use this from tools to ensure the file-level metadata
 *  brand layer is applied on free sessions (in addition to the filename suffix
 *  from the download interceptor). */
export async function encodeWavBranded(ab: AudioBuffer): Promise<Blob> {
  const raw = encodeWav(ab);
  try {
    const { brandAudioBlob } = await import('@/lib/watermark/audio');
    return await brandAudioBlob(raw);
  } catch { return raw; }
}

async function encodeMp3Main(ab: AudioBuffer, kbps = 192): Promise<Blob> {
  const mod = await import('@breezystack/lamejs');
  const Mp3Encoder = (mod as unknown as { Mp3Encoder: LameStatic }).Mp3Encoder;
  const channels = Math.min(2, ab.numberOfChannels);
  const enc = new Mp3Encoder(channels, ab.sampleRate, kbps);

  const left = floatTo16(ab.getChannelData(0));
  const right = channels === 2 ? floatTo16(ab.getChannelData(1)) : undefined;

  const out: Uint8Array[] = [];
  const block = 1152;
  for (let i = 0; i < left.length; i += block) {
    const l = left.subarray(i, i + block);
    const r = right ? right.subarray(i, i + block) : undefined;
    const chunk = enc.encodeBuffer(l, r);
    if (chunk.length) out.push(chunk);
  }
  const tail = enc.flush();
  if (tail.length) out.push(tail);
  return new Blob(out as BlobPart[], { type: 'audio/mp3' });
}

function floatTo16(arr: Float32Array): Int16Array {
  const out = new Int16Array(arr.length);
  for (let i = 0; i < arr.length; i++) {
    const s = clamp(arr[i]);
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  // 60s defer matches the rest of the codebase — 10s was tight on slow mobile
  // networks where the download dialog opens after a few seconds and aborts
  // the save when the blob URL is already revoked.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
