/**
 * Auto-subtitle engine — turn a video's speech into timed captions, on-device.
 *
 *   video ──ffmpeg extract→ wav ──Whisper→ timed chunks ──→ SRT/VTT
 *                                                      └──→ burned-in video
 *
 * Reuses the existing Whisper transcribe engine (timestamps) and the same
 * canvas-PNG → ffmpeg-overlay technique as the Add-Text tool, so captions burn
 * in WITHOUT libass (which our ffmpeg core lacks). All browser-side, no server.
 */

import { transcribe, type TranscribeChunk, type TranscribeSize } from '@/engines/transcribe';
import { DeviceLimitError } from '@/lib/compute/device-profile';

export type { TranscribeChunk } from '@/engines/transcribe';

export interface AutoSubOptions {
  size?: TranscribeSize;          // whisper model size
  language?: string;              // BCP-47, omit for auto-detect
  translate?: boolean;            // translate speech → English (whisper task)
  onProgress?: (p: { phase: string; ratio: number }) => void;
}

/** Extract the audio track of a video to a wav Blob (robust across containers). */
async function extractAudio(file: File, onProgress?: (r: number) => void): Promise<Blob> {
  const { runFfmpeg, extOf } = await import('@/engines/ffmpeg');
  const inExt = extOf(file.name) || 'mp4';
  return runFfmpeg({
    input: file, inputName: `in.${inExt}`, outputName: 'out.wav',
    // 16 kHz mono PCM — exactly what Whisper wants, tiny, fast.
    args: (i, o) => ['-i', i, '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', o],
    mimeType: 'audio/wav', onProgress,
  });
}

/** Transcribe a video into timed caption chunks. */
export async function videoToCaptions(file: File, opts: AutoSubOptions = {}): Promise<TranscribeChunk[]> {
  const report = opts.onProgress ?? (() => {});
  let audio: Blob = file;
  // Try decoding the video's audio directly (Chrome can for mp4/webm); if that
  // fails for the container, fall back to an ffmpeg extraction.
  try {
    report({ phase: 'Listening', ratio: 0.05 });
    const res = await transcribe(file, {
      size: opts.size ?? 'tiny', language: opts.language, translate: opts.translate,
      onProgress: (p) => report({ phase: p.phase, ratio: 0.1 + p.ratio * 0.85 }),
    });
    if (res.chunks.length) return res.chunks;
  } catch (e) {
    // A device-limit refusal must reach the user, not fall through to an
    // ffmpeg extraction that would load the whole video into memory again.
    if (e instanceof DeviceLimitError) throw e;
    /* decodeAudioData couldn't read this container → extract first */
  }

  report({ phase: 'Extracting audio', ratio: 0.05 });
  audio = await extractAudio(file, (r) => report({ phase: 'Extracting audio', ratio: 0.05 + r * 0.15 }));
  const res = await transcribe(audio, {
    size: opts.size ?? 'tiny', language: opts.language, translate: opts.translate,
    onProgress: (p) => report({ phase: p.phase, ratio: 0.2 + p.ratio * 0.75 }),
  });
  return res.chunks;
}

export interface CaptionStyle {
  fontSize: number;          // px relative to a 1280-wide reference, scaled to the video
  color: string;             // text color
  highlight: boolean;        // draw a rounded box behind the text (Instagram style)
  position: 'bottom' | 'center' | 'top';
  uppercase: boolean;
}

export const DEFAULT_CAPTION_STYLE: CaptionStyle = {
  fontSize: 52, color: '#ffffff', highlight: true, position: 'bottom', uppercase: false,
};

/** Render one caption to a transparent PNG sized to the video frame. */
function renderCaptionPng(text: string, vw: number, vh: number, style: CaptionStyle): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = vw; canvas.height = vh;
  const ctx = canvas.getContext('2d')!;
  const scale = vw / 1280;
  const fs = Math.max(14, Math.round(style.fontSize * scale));
  const label = style.uppercase ? text.toUpperCase() : text;
  ctx.font = `800 ${fs}px system-ui, -apple-system, "Segoe UI", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Word-wrap to ~88% of the width. CJK-aware: split on spaces for Latin, but a
  // single token wider than the line (incl. space-less Chinese/Japanese/Thai or
  // one very long URL) also breaks at CHARACTER boundaries so it never overflows.
  const maxW = vw * 0.88;
  const lines: string[] = [];
  // Break any token that's still too wide into char-level pieces that fit.
  const breakLong = (token: string): string[] => {
    if (ctx.measureText(token).width <= maxW) return [token];
    const out: string[] = [];
    let chunk = '';
    for (const ch of token) {
      const t = chunk + ch;
      if (ctx.measureText(t).width > maxW && chunk) { out.push(chunk); chunk = ch; }
      else chunk = t;
    }
    if (chunk) out.push(chunk);
    return out;
  };
  let cur = '';
  for (const word of label.split(/\s+/)) {
    for (const w of breakLong(word)) {
      const test = cur ? `${cur} ${w}` : w;
      if (ctx.measureText(test).width > maxW && cur) { lines.push(cur); cur = w; }
      else cur = test;
    }
  }
  if (cur) lines.push(cur);

  const lineH = fs * 1.25;
  const blockH = lines.length * lineH;
  const margin = vh * 0.06;
  const cy = style.position === 'top' ? margin + blockH / 2
    : style.position === 'center' ? vh / 2
    : vh - margin - blockH / 2;
  const cx = vw / 2;

  lines.forEach((ln, i) => {
    const y = cy - blockH / 2 + lineH / 2 + i * lineH;
    if (style.highlight) {
      const w = ctx.measureText(ln).width + fs * 0.7;
      const h = lineH * 0.96;
      const x = cx - w / 2;
      const r = h * 0.22;
      ctx.fillStyle = 'rgba(0,0,0,0.62)';
      ctx.beginPath();
      ctx.roundRect(x, y - h / 2, w, h, r);
      ctx.fill();
    } else {
      ctx.lineWidth = Math.max(2, fs * 0.14);
      ctx.strokeStyle = 'rgba(0,0,0,0.85)';
      ctx.lineJoin = 'round';
      ctx.strokeText(ln, cx, y);
    }
    ctx.fillStyle = style.color;
    ctx.fillText(ln, cx, y);
  });

  return new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('caption render failed'))), 'image/png'));
}

/**
 * Burn captions into the video: one transparent PNG per chunk, each overlaid
 * only during its time window. Done in a single ffmpeg pass with a filter graph.
 */
export async function burnCaptions(
  file: File,
  chunks: TranscribeChunk[],
  vw: number,
  vh: number,
  style: CaptionStyle,
  onProgress?: (r: number) => void,
): Promise<Blob> {
  const { runFfmpegMulti, extOf } = await import('@/engines/ffmpeg');
  const usable = chunks.filter((c) => c.text.trim() && c.end > c.start);
  if (!usable.length) throw new Error('No captions to burn in');

  const pngs = await Promise.all(usable.map((c) => renderCaptionPng(c.text.trim(), vw, vh, style)));
  const inputs = [
    { name: `vid.${extOf(file.name) || 'mp4'}`, data: file },
    ...pngs.map((b, i) => ({ name: `cap${i}.png`, data: b })),
  ];

  // Chain overlays: [0:v][1:v]overlay=enable='between(t,a,b)'[v1]; [v1][2:v]...
  const args = (ins: string[], o: string): string[] => {
    const parts: string[] = [];
    let last = '0:v';
    usable.forEach((c, i) => {
      const out = i === usable.length - 1 ? 'vout' : `v${i + 1}`;
      const en = `between(t,${c.start.toFixed(2)},${c.end.toFixed(2)})`;
      parts.push(`[${last}][${i + 1}:v]overlay=0:0:enable='${en}'[${out}]`);
      last = out;
    });
    return [
      ...ins.flatMap((n) => ['-i', n]),
      '-filter_complex', parts.join(';'),
      '-map', '[vout]', '-map', '0:a?',
      '-c:v', 'libx264', '-preset', 'fast', '-crf', '23', '-pix_fmt', 'yuv420p',
      '-c:a', 'copy', '-movflags', '+faststart', o,
    ];
  };

  return runFfmpegMulti({ inputs, outputName: 'out.mp4', args, mimeType: 'video/mp4', onProgress });
}
