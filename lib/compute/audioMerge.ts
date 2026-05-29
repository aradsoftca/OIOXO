/**
 * Merge audio tracks off the main thread. Decoding already happened on the main
 * thread (Web Audio); here we copy the raw channels, hand them to the worker
 * (zero-copy transfer), and get back an encoded WAV/MP3 with progress.
 * Falls back to the synchronous engine path if Workers are unavailable.
 */

import { startJob, updateJob, endJob } from './progressBus';
import { loadProtectedWorker } from '@/lib/protect/protected-worker';

export interface AudioProgress { phase: string; ratio: number }

/**
 * Encode a single AudioBuffer to WAV/MP3 in the worker (off the main thread),
 * publishing to the global progress bar. Used by every audio tool's export.
 */
export async function encodeAudio(
  buffer: AudioBuffer,
  format: 'wav' | 'mp3',
  bitrate = 192,
  onProgress?: (p: AudioProgress) => void,
): Promise<Blob> {
  startJob('Encoding');
  try {
    const raw = await mergeAudio([buffer], format, bitrate, (p) => { updateJob(p.phase, p.ratio); onProgress?.(p); });
    // File-level brand metadata (free → WAV LIST/INFO or MP3 ID3v1; Pro → unchanged).
    try {
      const { brandAudioBlob } = await import('@/lib/watermark/audio');
      return await brandAudioBlob(raw);
    } catch { return raw; }
  } finally {
    endJob();
  }
}

/** Concat + encode in the audio worker (WAV is fast; MP3 here uses lamejs). */
async function workerMerge(
  buffers: AudioBuffer[],
  format: 'wav' | 'mp3',
  bitrate: number,
  onProgress?: (p: AudioProgress) => void,
): Promise<Blob> {
  const worker = await loadProtectedWorker('audio');
  const tracks = buffers.map((ab) => {
    const channels: Float32Array[] = [];
    for (let c = 0; c < ab.numberOfChannels; c++) channels.push(new Float32Array(ab.getChannelData(c)));
    return { sr: ab.sampleRate, len: ab.length, channels };
  });
  const transfer: Transferable[] = tracks.flatMap((t) => t.channels.map((c) => c.buffer));
  return new Promise<Blob>((resolve, reject) => {
    worker.onmessage = (e: MessageEvent) => {
      const m = e.data as Record<string, unknown>;
      if (m.type === 'progress') onProgress?.({ phase: String(m.phase), ratio: Number(m.ratio) });
      else if (m.type === 'done') { resolve(new Blob([m.buffer as ArrayBuffer], { type: String(m.mime) })); worker.terminate(); }
      else if (m.type === 'error') { reject(new Error(String(m.message))); worker.terminate(); }
    };
    worker.onerror = (ev) => { reject(new Error(ev.message || 'Audio worker failed')); worker.terminate(); };
    worker.postMessage({ type: 'merge', id: 1, tracks, format, bitrate }, transfer);
  });
}

export async function mergeAudio(
  buffers: AudioBuffer[],
  format: 'wav' | 'mp3',
  bitrate: number,
  onProgress?: (p: AudioProgress) => void,
): Promise<Blob> {
  if (typeof Worker === 'undefined') {
    const { concat, encodeWav, encodeMp3 } = await import('@/engines/audio');
    const out = concat(buffers);
    return format === 'mp3' ? encodeMp3(out, bitrate) : encodeWav(out);
  }

  // Concat + WAV in the worker — fast, off the main thread.
  const wav = await workerMerge(buffers, 'wav', bitrate, (p) =>
    onProgress?.({ phase: 'Merging', ratio: format === 'mp3' ? p.ratio * 0.5 : p.ratio }));
  if (format === 'wav') return wav;

  // WAV → MP3 via the multi-threaded ffmpeg core (libmp3lame) — far faster than
  // pure-JS lamejs. Falls back to lamejs in the worker if ffmpeg can't load.
  try {
    const { runFfmpeg } = await import('@/engines/ffmpeg');
    const kbps = Math.max(64, Math.min(320, bitrate || 192));
    return await runFfmpeg({
      input: wav, inputName: 'in.wav', outputName: 'out.mp3',
      args: (i, o) => ['-i', i, '-c:a', 'libmp3lame', '-b:a', `${kbps}k`, o],
      mimeType: 'audio/mpeg',
      onProgress: (r) => onProgress?.({ phase: 'Encoding', ratio: 0.5 + r * 0.5 }),
    });
  } catch {
    return workerMerge(buffers, 'mp3', bitrate, (p) => onProgress?.({ phase: 'Encoding', ratio: 0.5 + p.ratio * 0.5 }));
  }
}
