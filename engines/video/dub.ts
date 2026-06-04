/**
 * Auto-Dub — replace a video's speech with a synthesized voice in another
 * language, fully on-device:
 *
 *   video → transcribe (timestamps) → translate each line → speak each line →
 *   place each clip at its original timestamp on a new audio track → mux over video.
 *
 * Pure assembly of engines we already have (transcribe, translate, tts/studio,
 * ffmpeg). No server. Timing is best-effort: each spoken line starts at the
 * original line's time; lines that run long simply overlap into the next gap.
 */

import { videoToCaptions } from '@/engines/subtitle/auto';
import { speakToBuffer, VOICE_STYLES, isLanguageSupported } from '@/engines/tts/studio';

export interface DubOptions {
  targetLang: string;
  voiceStyleId?: string;
  sourceLang?: string;          // omit to auto-detect
  durationSec: number;          // video duration, for the track length
  onProgress?: (phase: string, r: number) => void;
}

export async function dubVideo(file: File, opts: DubOptions): Promise<Blob> {
  const report = opts.onProgress ?? (() => {});
  if (!isLanguageSupported(opts.targetLang)) throw new Error('That target language has no on-device voice yet.');
  const style = VOICE_STYLES.find((s) => s.id === opts.voiceStyleId) ?? VOICE_STYLES[0];

  // 1) transcribe
  report('Transcribing', 0.02);
  const chunks = await videoToCaptions(file, { size: 'tiny', language: opts.sourceLang, onProgress: (p) => report(p.phase, 0.02 + p.ratio * 0.33) });
  if (!chunks.length) throw new Error('No speech found to dub.');

  // 2) translate + 3) synthesize each line
  const { translate } = await import('@/lib/ai/translate');
  const src = opts.sourceLang || 'en';
  const buffers: { start: number; buf: AudioBuffer }[] = [];
  let sampleRate = 16000;
  for (let i = 0; i < chunks.length; i++) {
    const c = chunks[i];
    let text = c.text.trim();
    if (src !== opts.targetLang) text = (await translate(text, src, opts.targetLang).catch(() => null)) || text;
    if (!text) continue;
    try {
      const buf = await speakToBuffer(text, opts.targetLang, style);
      sampleRate = buf.sampleRate;
      buffers.push({ start: c.start, buf });
    } catch { /* skip a line that fails to synth */ }
    report('Voicing', 0.35 + ((i + 1) / chunks.length) * 0.5);
  }
  if (!buffers.length) throw new Error('Could not synthesize the dubbed audio.');

  // 4) lay each clip onto one track at its timestamp
  report('Assembling audio', 0.88);
  const total = Math.max(1, Math.ceil((opts.durationSec || (buffers.at(-1)!.start + 3)) * sampleRate));
  const track = new Float32Array(total);
  for (const { start, buf } of buffers) {
    const src0 = buf.getChannelData(0);
    let off = Math.floor(start * sampleRate);
    for (let j = 0; j < src0.length && off < total; j++, off++) {
      track[off] += src0[j];
      if (track[off] > 1) track[off] = 1; else if (track[off] < -1) track[off] = -1;
    }
  }
  const { encodeWav } = await import('@/engines/audio');
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AC();
  const ab = ctx.createBuffer(1, total, sampleRate);
  ab.getChannelData(0).set(track);
  const wav = encodeWav(ab);
  try { ctx.close(); } catch { /* */ }

  // 5) mux the new audio over the original video (keep video stream as-is)
  report('Muxing', 0.94);
  const { runFfmpegMulti, extOf } = await import('@/engines/ffmpeg');
  const inExt = extOf(file.name) || 'mp4';
  return runFfmpegMulti({
    inputs: [{ name: `v.${inExt}`, data: file }, { name: 'a.wav', data: wav }],
    outputName: 'out.mp4',
    args: (n, o) => ['-i', n[0], '-i', n[1], '-map', '0:v:0', '-map', '1:a:0',
      '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', '-shortest', '-movflags', '+faststart', o],
    mimeType: 'video/mp4',
    onProgress: (r) => report('Muxing', 0.94 + r * 0.06),
  });
}
