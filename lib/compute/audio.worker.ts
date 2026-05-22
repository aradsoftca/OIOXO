/**
 * Audio compute worker. Web Audio (AudioContext/decodeAudioData) is main-thread
 * only, so DECODING stays on the main thread — but the heavy parts (concat +
 * WAV/MP3 encoding) run here on raw channel Float32Arrays, off the main thread,
 * with progress. Channel buffers arrive zero-copy (Transferable).
 */

interface Track { sr: number; len: number; channels: Float32Array[] }
interface MergeMsg { type: 'merge'; id: number; tracks: Track[]; format: 'wav' | 'mp3'; bitrate: number }

const ctx = self as unknown as { postMessage: (m: unknown, t?: Transferable[]) => void; onmessage: ((e: MessageEvent) => void) | null };
const post = (m: Record<string, unknown>, t: Transferable[] = []) => ctx.postMessage(m, t);
const clamp = (v: number) => (v < -1 ? -1 : v > 1 ? 1 : v);

function concatPlain(tracks: Track[]): { sampleRate: number; channels: Float32Array[]; length: number } {
  const sr = tracks[0].sr;
  const numCh = Math.max(...tracks.map((t) => t.channels.length));
  const totalLen = tracks.reduce((s, t) => s + Math.round(t.len * (sr / t.sr)), 0);
  const out = Array.from({ length: numCh }, () => new Float32Array(totalLen));
  let offset = 0;
  for (const t of tracks) {
    const ratio = sr / t.sr;
    for (let c = 0; c < numCh; c++) {
      const src = t.channels[c] ?? t.channels[t.channels.length - 1];
      const dst = out[c];
      if (ratio === 1) {
        dst.set(src, offset);
      } else {
        const n = Math.floor(t.len * ratio);
        for (let i = 0; i < n; i++) {
          const j = i / ratio;
          const i0 = Math.floor(j);
          const f = j - i0;
          dst[offset + i] = (src[i0] ?? 0) * (1 - f) + (src[i0 + 1] ?? 0) * f;
        }
      }
    }
    offset += Math.round(t.len * ratio);
  }
  return { sampleRate: sr, channels: out, length: totalLen };
}

function writeStr(v: DataView, off: number, s: string) { for (let i = 0; i < s.length; i++) v.setUint8(off + i, s.charCodeAt(i)); }

// WAV PCM is little-endian. Int16Array writes in the platform's byte order, so
// we only take the fast typed-array path on LE machines (x86/ARM — effectively
// everything); BE falls back to the per-sample DataView path.
const LITTLE_ENDIAN = (() => {
  const b = new ArrayBuffer(2);
  new DataView(b).setInt16(0, 256, true);
  return new Int16Array(b)[0] === 256;
})();

function encodeWav(m: { sampleRate: number; channels: Float32Array[]; length: number }, id: number): ArrayBuffer {
  const channels = m.channels.length, sr = m.sampleRate, len = m.length;
  const blockAlign = channels * 2;
  const dataSize = len * blockAlign;
  const buf = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buf);
  writeStr(view, 0, 'RIFF'); view.setUint32(4, 36 + dataSize, true); writeStr(view, 8, 'WAVE');
  writeStr(view, 12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
  view.setUint16(22, channels, true); view.setUint32(24, sr, true); view.setUint32(28, sr * blockAlign, true);
  view.setUint16(32, blockAlign, true); view.setUint16(34, 16, true);
  writeStr(view, 36, 'data'); view.setUint32(40, dataSize, true);
  const step = Math.max(1, Math.floor(len / 50));

  if (LITTLE_ENDIAN) {
    // Fast path: write 16-bit samples straight into a typed-array view of the
    // data region. Typed-array indexing is JIT-friendly; ~5-10x the DataView loop.
    const out = new Int16Array(buf, 44, len * channels);
    let p = 0;
    for (let i = 0; i < len; i++) {
      for (let c = 0; c < channels; c++) {
        const s = clamp(m.channels[c][i]);
        out[p++] = s < 0 ? s * 0x8000 : s * 0x7fff;
      }
      if (i % step === 0) post({ type: 'progress', id, phase: 'Encoding', ratio: 0.2 + 0.75 * (i / len) });
    }
    return buf;
  }

  // Big-endian fallback.
  let offset = 44;
  for (let i = 0; i < len; i++) {
    for (let c = 0; c < channels; c++) {
      const s = clamp(m.channels[c][i]);
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      offset += 2;
    }
    if (i % step === 0) post({ type: 'progress', id, phase: 'Encoding', ratio: 0.2 + 0.75 * (i / len) });
  }
  return buf;
}

function floatTo16(arr: Float32Array): Int16Array {
  const out = new Int16Array(arr.length);
  for (let i = 0; i < arr.length; i++) { const s = clamp(arr[i]); out[i] = s < 0 ? s * 0x8000 : s * 0x7fff; }
  return out;
}

async function encodeMp3(m: { sampleRate: number; channels: Float32Array[]; length: number }, kbps: number, id: number): Promise<ArrayBuffer> {
  const mod = await import('@breezystack/lamejs');
  const Mp3Encoder = (mod as unknown as { Mp3Encoder: new (ch: number, sr: number, k: number) => { encodeBuffer: (l: Int16Array, r?: Int16Array) => Uint8Array; flush: () => Uint8Array } }).Mp3Encoder;
  const channels = Math.min(2, m.channels.length);
  const enc = new Mp3Encoder(channels, m.sampleRate, kbps);
  const left = floatTo16(m.channels[0]);
  const right = channels === 2 ? floatTo16(m.channels[1]) : undefined;
  const out: Uint8Array[] = [];
  const block = 1152;
  for (let i = 0; i < left.length; i += block) {
    const chunk = enc.encodeBuffer(left.subarray(i, i + block), right ? right.subarray(i, i + block) : undefined);
    if (chunk.length) out.push(chunk);
    if ((i / block) % 64 === 0) post({ type: 'progress', id, phase: 'Encoding', ratio: 0.2 + 0.75 * (i / left.length) });
  }
  const tail = enc.flush();
  if (tail.length) out.push(tail);
  const total = out.reduce((s, c) => s + c.length, 0);
  const ab = new Uint8Array(total);
  let o = 0;
  for (const c of out) { ab.set(c, o); o += c.length; }
  return ab.buffer;
}

ctx.onmessage = async (e: MessageEvent<MergeMsg>) => {
  const m = e.data;
  try {
    if (m.type === 'merge') {
      post({ type: 'progress', id: m.id, phase: 'Merging', ratio: 0.1 });
      const merged = concatPlain(m.tracks);
      const mime = m.format === 'mp3' ? 'audio/mp3' : 'audio/wav';
      const buffer = m.format === 'mp3'
        ? await encodeMp3(merged, m.bitrate || 192, m.id)
        : encodeWav(merged, m.id);
      post({ type: 'done', id: m.id, buffer, mime }, [buffer]);
    }
  } catch (err) {
    post({ type: 'error', id: m.id, message: (err as Error).message || String(err) });
  }
};
