/**
 * Xonvert AI — inline execution capabilities.
 *
 * When the router lands confidently on one of these tools AND the right kind of
 * file is in play, the AI performs the job *in the chat* (via the headless
 * engines) and returns a result card — no page navigation.
 *
 * Only unambiguous operations live here: filters/transforms with no scale to
 * guess, and audio ops where the intent ("louder", "2x", "reverse") maps to a
 * concrete factor. Tools that need a slider (brightness amount, exact resize,
 * crop) are deliberately NOT here — the router hands those off to the tool page
 * so the user sets values precisely. Keyed by registry tool id.
 */

import type { ActionResult } from '@/lib/ai-actions';

export type CapInput = 'image' | 'audio' | 'video';

export interface Capability {
  toolId: string;
  input: CapInput;
  /** Present-tense verb phrase for the running indicator + ask-file prompt. */
  verb: string;
  run: (file: File, text: string) => Promise<ActionResult>;
}

function base(file: File): string {
  const dot = file.name.lastIndexOf('.');
  return dot > 0 ? file.name.slice(0, dot) : file.name;
}

// --- image: decode → apply ImageData op → encode PNG -----------------------

type ImgOp = (filters: typeof import('@/engines/image')['filters'], transforms: typeof import('@/engines/image')['transforms'], data: ImageData) => ImageData;

async function runImage(file: File, suffix: string, op: ImgOp): Promise<ActionResult> {
  const img = await import('@/engines/image');
  const { data } = await img.decode(file);
  const out = op(img.filters, img.transforms, data);
  const { blob } = await img.encode(out, 'png', {});
  return { kind: 'image', url: URL.createObjectURL(blob), filename: `${base(file)}-${suffix}.png`, note: `${out.width}×${out.height}`, blob };
}

function imageCap(toolId: string, suffix: string, verb: string, op: ImgOp): Capability {
  return { toolId, input: 'image', verb, run: (file) => runImage(file, suffix, op) };
}

// --- audio: decode → apply AudioBuffer op → encode WAV ----------------------

async function runAudio(file: File, suffix: string, op: (a: typeof import('@/engines/audio'), ab: AudioBuffer) => AudioBuffer): Promise<ActionResult> {
  const audio = await import('@/engines/audio');
  const ab = await audio.decode(await file.arrayBuffer());
  const out = op(audio, ab);
  const blob = audio.encodeWav(out);
  return { kind: 'file', blob, filename: `${base(file)}-${suffix}.wav`, note: `${out.duration.toFixed(1)}s · ${out.sampleRate} Hz` };
}

function audioCap(toolId: string, suffix: string, verb: string, op: (a: typeof import('@/engines/audio'), ab: AudioBuffer) => AudioBuffer): Capability {
  return { toolId, input: 'audio', verb, run: (file) => runAudio(file, suffix, op) };
}

/** "louder/quieter/150%/2x" → gain multiplier. */
function parseGain(text: string): number {
  const pct = text.match(/(\d+(?:\.\d+)?)\s*%/);
  if (pct) return Math.max(0, parseFloat(pct[1]) / 100);
  const x = text.match(/(\d+(?:\.\d+)?)\s*x\b/);
  if (x) return parseFloat(x[1]);
  if (/\b(quiet|lower|soft|reduce|down|decrease)/i.test(text)) return 0.55;
  return 1.6; // default: louder
}

/** "2x/half/double/faster/slower" → speed factor. */
function parseSpeed(text: string): number {
  const x = text.match(/(\d+(?:\.\d+)?)\s*x\b/);
  if (x) return parseFloat(x[1]);
  if (/\bhalf\b/i.test(text)) return 0.5;
  if (/\bdouble\b/i.test(text)) return 2;
  if (/\b(slow|slower|slow down)/i.test(text)) return 0.7;
  return 1.5; // default: faster
}

/** Signed adjustment for brightness/contrast/saturation from words + optional %. */
function parseAdjust(text: string, down: RegExp): number {
  const pct = text.match(/(-?\d{1,3})\s*%/);
  const mag = pct ? Math.min(100, Math.abs(parseInt(pct[1], 10)))
    : /\b(much|very|a lot|way|really|strong)\b/i.test(text) ? 60
    : /\b(a little|slightly|bit|tad|subtle|gentle)\b/i.test(text) ? 15 : 35;
  return down.test(text) ? -mag : mag;
}

/** Target dimensions from "800x600", "800 wide", "50%", "half/double/thumbnail". */
function parseResize(text: string, ow: number, oh: number): { w: number; h: number } | null {
  const lc = text.toLowerCase();
  let m = lc.match(/(\d{2,5})\s*(?:x|×|by)\s*(\d{2,5})/);
  if (m) return { w: +m[1], h: +m[2] };
  m = lc.match(/(\d{1,3})\s*%/);
  if (m) { const s = +m[1] / 100; return { w: Math.round(ow * s), h: Math.round(oh * s) }; }
  m = lc.match(/(\d{2,5})\s*(?:px)?\s*(?:wide|width|across)/) || lc.match(/width\s*(?:to|:)?\s*(\d{2,5})/);
  if (m) { const w = +m[1]; return { w, h: Math.round(oh * w / ow) }; }
  m = lc.match(/(\d{2,5})\s*(?:px)?\s*(?:tall|high|height)/) || lc.match(/height\s*(?:to|:)?\s*(\d{2,5})/);
  if (m) { const h = +m[1]; return { w: Math.round(ow * h / oh), h }; }
  m = lc.match(/\bto\s+(\d{2,5})\b/);
  if (m) { const w = +m[1]; return { w, h: Math.round(oh * w / ow) }; }
  if (/\b(half|smaller|reduce|shrink)\b/.test(lc)) return { w: Math.round(ow / 2), h: Math.round(oh / 2) };
  if (/\b(double|bigger|larger|enlarge)\b/.test(lc)) return { w: ow * 2, h: oh * 2 };
  if (/\bthumb(nail)?\b/.test(lc)) { const w = 320; return { w, h: Math.round(oh * w / ow) }; }
  return null;
}

/** Rotation angle (degrees, clockwise). */
function parseAngle(text: string): number {
  const m = text.match(/(-?\d{1,3})\s*(?:°|deg)/);
  if (m) return ((parseInt(m[1], 10) % 360) + 360) % 360;
  if (/\b(180|upside ?down|half ?turn)\b/i.test(text)) return 180;
  if (/\b(left|counter|anti)/i.test(text)) return 270;
  return 90; // default: clockwise quarter turn
}

/** Rotate ImageData by `deg` clockwise via canvas. */
function rotateImageData(d: ImageData, deg: number): ImageData {
  const swap = deg % 180 !== 0;
  const tmp = document.createElement('canvas'); tmp.width = d.width; tmp.height = d.height;
  tmp.getContext('2d')!.putImageData(d, 0, 0);
  const c = document.createElement('canvas');
  c.width = swap ? d.height : d.width; c.height = swap ? d.width : d.height;
  const ctx = c.getContext('2d')!;
  ctx.translate(c.width / 2, c.height / 2);
  ctx.rotate((deg * Math.PI) / 180);
  ctx.drawImage(tmp, -d.width / 2, -d.height / 2);
  return ctx.getImageData(0, 0, c.width, c.height);
}

/** Trim window in seconds from "first N", "last N", "N to M", "to N". */
function parseTrim(text: string, dur: number): { start: number; end: number } {
  const lc = text.toLowerCase();
  let m = lc.match(/(\d+(?:\.\d+)?)\s*(?:to|-|–)\s*(\d+(?:\.\d+)?)/);
  if (m) return { start: +m[1], end: Math.min(dur, +m[2]) };
  m = lc.match(/last\s+(\d+(?:\.\d+)?)/);
  if (m) return { start: Math.max(0, dur - +m[1]), end: dur };
  m = lc.match(/(?:first|to|keep|trim to)\s+(\d+(?:\.\d+)?)/) || lc.match(/(\d+(?:\.\d+)?)\s*(?:s|sec|seconds)\b/);
  if (m) return { start: 0, end: Math.min(dur, +m[1]) };
  return { start: 0, end: Math.min(dur, 30) };
}

// --- the registry ----------------------------------------------------------

// --- image text overlay + watermark (canvas; text comes from the request) ---
function parseOverlayText(text: string): string | null {
  const m = text.match(/(?:say(?:ing)?|with|text|reads?|:)\s*["“]?([^"”\n]+?)["”]?\s*$/i) || text.match(/["“]([^"”]+)["”]/);
  return m ? m[1].trim() : null;
}
async function runImageOverlay(file: File, text: string, mode: 'caption' | 'watermark'): Promise<ActionResult> {
  const img = await import('@/engines/image');
  const { data } = await img.decode(file);
  const content = parseOverlayText(text) ?? (mode === 'watermark' ? 'WATERMARK' : 'Your text');
  const c = document.createElement('canvas'); c.width = data.width; c.height = data.height;
  const ctx = c.getContext('2d')!;
  ctx.putImageData(data, 0, 0);
  if (mode === 'watermark') {
    ctx.save();
    ctx.globalAlpha = 0.25; ctx.translate(c.width / 2, c.height / 2); ctx.rotate(-Math.PI / 6);
    const fs = Math.max(20, Math.round(c.width / 12));
    ctx.font = `bold ${fs}px sans-serif`; ctx.fillStyle = '#ffffff'; ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.lineWidth = fs / 16; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.strokeText(content, 0, 0); ctx.fillText(content, 0, 0);
    ctx.restore();
  } else {
    const fs = Math.max(24, Math.round(c.width / 14));
    ctx.font = `bold ${fs}px sans-serif`; ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#000000';
    ctx.lineWidth = fs / 8; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    const x = c.width / 2, y = c.height - fs * 0.6;
    ctx.strokeText(content, x, y); ctx.fillText(content, x, y);
  }
  const blob = await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('encode failed'))), 'image/png'));
  return { kind: 'image', url: URL.createObjectURL(blob), filename: `${base(file)}-${mode}.png`, note: content, blob };
}

// --- video: grab a still frame (fast; the heavy ops stay on the tool page) ---
function withTimeout<T>(p: Promise<T>, ms: number, msg: string): Promise<T> {
  return Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error(msg)), ms))]);
}
async function runVideoFrame(file: File, suffix: string): Promise<ActionResult> {
  const v = await import('@/engines/video');
  // Bound the load+seek so a corrupt or unsupported video never hangs the chat.
  const { video, url } = await withTimeout(v.loadVideoElement(file), 15_000, 'Could not load this video.');
  try {
    const t = Math.min(1, (video.duration || 3) / 3); // ~a third in, but ≥ frame 1s
    const blob = await withTimeout(v.extractFrameAt(video, t, 1, 'image/png', 0.92), 15_000, 'Could not read a frame.');
    return { kind: 'image', url: URL.createObjectURL(blob), filename: `${base(file)}-${suffix}.png`, note: 'frame', blob };
  } finally { URL.revokeObjectURL(url); }
}

/** Semitone shift from "up/down", "N semitones", "an octave". */
function parsePitch(text: string): number {
  const m = text.match(/(-?\d+)\s*(?:semitone|step|half-?step)/i);
  if (m) return Math.max(-24, Math.min(24, parseInt(m[1], 10)));
  if (/\boctave\b/i.test(text)) return /\b(down|lower)\b/i.test(text) ? -12 : 12;
  if (/\b(down|lower|deeper|deep)\b/i.test(text)) return -4;
  if (/\b(up|higher|raise|chipmunk)\b/i.test(text)) return 4;
  return 3;
}

const LIST: Capability[] = [
  // image — unambiguous filters/transforms
  imageCap('image-grayscale', 'grayscale', 'convert it to grayscale', (f, _t, d) => f.grayscale(d)),
  imageCap('image-invert', 'inverted', 'invert the colours', (f, _t, d) => f.invert(d)),
  imageCap('image-sepia', 'sepia', 'apply a sepia tone', (f, _t, d) => f.sepia(d)),
  imageCap('image-vintage', 'vintage', 'give it a vintage look', (f, _t, d) => f.vintage(d)),
  imageCap('image-sharpen', 'sharp', 'sharpen it', (f, _t, d) => f.sharpen(d)),
  imageCap('image-pixelate', 'pixelated', 'pixelate it', (_f, t, d) => t.pixelate(d, { size: 12 })),
  imageCap('image-flip', 'flipped', 'flip it', (_f, t, d) => t.flip(d, { horizontal: true })),
  imageCap('image-vignette', 'vignette', 'add a vignette', (_f, t, d) => t.vignette(d, {})),
  imageCap('image-blur', 'blurred', 'blur it', (f, _t, d) => f.convolve3x3(d, [1, 1, 1, 1, 1, 1, 1, 1, 1], 9)),
  imageCap('image-round-corners', 'rounded', 'round the corners', (_f, t, d) => t.roundCorners(d, { radius: 48 })),
  imageCap('image-border', 'bordered', 'add a border', (_f, t, d) => t.border(d, { width: 24, color: '#000000' })),
  { toolId: 'image-thumbnail', input: 'image', verb: 'make a thumbnail', run: async (file) => {
      const img = await import('@/engines/image');
      const { data } = await img.decode(file);
      const w = Math.min(320, data.width); const h = Math.round((data.height * w) / data.width);
      const out = await img.resize(data, { width: w, height: h });
      const { blob } = await img.encode(out, 'png', {});
      return { kind: 'image', url: URL.createObjectURL(blob), filename: `${base(file)}-thumb.png`, note: `${w}×${h}`, blob };
  } },
  { toolId: 'image-upscale', input: 'image', verb: 'upscale it', run: async (file, text) => {
      const { upscale } = await import('@/engines/upscale');
      const factor: 2 | 4 = /\b4x|4 ?times|quadruple\b/i.test(text) ? 4 : 2;
      const blob = await upscale(file, { factor });
      return { kind: 'image', url: URL.createObjectURL(blob), filename: `${base(file)}-upscaled.png`, note: `${factor}×`, blob };
  } },
  { toolId: 'image-add-text', input: 'image', verb: 'add text to it', run: (file, text) => runImageOverlay(file, text, 'caption') },
  { toolId: 'image-watermark', input: 'image', verb: 'add a watermark', run: (file, text) => runImageOverlay(file, text, 'watermark') },
  { toolId: 'image-crop', input: 'image', verb: 'crop it', run: async (file, text) => {
      const img = await import('@/engines/image');
      const { data } = await img.decode(file);
      const W = data.width, H = data.height;
      let cw: number, ch: number;
      const m = text.match(/(\d{2,5})\s*(?:x|×|by)\s*(\d{2,5})/i);
      if (m && !/\bsquare\b/i.test(text)) { cw = Math.min(W, +m[1]); ch = Math.min(H, +m[2]); }
      else { const s = Math.min(W, H); cw = s; ch = s; } // default / "square": centred square
      const cx = (W - cw) >> 1, cy = (H - ch) >> 1;
      const out = img.transforms.crop(data, { x: cx, y: cy, width: cw, height: ch });
      const { blob } = await img.encode(out, 'png', {});
      return { kind: 'image', url: URL.createObjectURL(blob), filename: `${base(file)}-cropped.png`, note: `${cw}×${ch}`, blob };
  } },
  { toolId: 'image-hue', input: 'image', verb: 'shift the hue', run: (file, text) => runImage(file, 'hue', (f, _t, d) => f.hue(d, { angle: parseAngle(text) })) },
  // image — background removal (async, alpha PNG)
  { toolId: 'image-remove-bg', input: 'image', verb: 'remove the background', run: async (file) => {
      const img = await import('@/engines/image');
      const blob = await img.removeBackground(file, {});
      return { kind: 'image', url: URL.createObjectURL(blob), filename: `${base(file)}-no-bg.png`, note: 'background removed', blob };
  } },

  // audio — unambiguous + parseable ops
  audioCap('audio-reverse', 'reversed', 'reverse it', (a, ab) => a.reverse(ab)),
  audioCap('audio-normalize', 'normalized', 'normalise the volume', (a, ab) => a.normalize(ab)),
  audioCap('audio-fade-in', 'fade-in', 'add a fade-in', (a, ab) => a.fadeIn(ab, 2)),
  audioCap('audio-fade-out', 'fade-out', 'add a fade-out', (a, ab) => a.fadeOut(ab, 2)),
  audioCap('audio-vocal-remover', 'instrumental', 'remove the vocals', (a, ab) => a.removeVocals(ab, 1)),
  audioCap('audio-stereo-to-mono', 'mono', 'make it mono', (a, ab) => a.toMono(ab)),
  audioCap('audio-mono-to-stereo', 'stereo', 'make it stereo', (a, ab) => a.toStereo(ab)),
  audioCap('audio-bass-boost', 'bass-boosted', 'boost the bass', (a, ab) => a.bassBoost(ab, 6)),
  audioCap('audio-treble-boost', 'treble-boosted', 'boost the treble', (a, ab) => a.trebleBoost(ab, 6)),
  audioCap('audio-echo', 'echo', 'add an echo', (a, ab) => a.echo(ab)),
  audioCap('audio-reverb', 'reverb', 'add reverb', (a, ab) => a.reverb(ab, 0.5)),
  { toolId: 'audio-pan', input: 'audio', verb: 'pan it', run: (file, text) =>
      runAudio(file, 'panned', (a, ab) => a.pan(ab, /right/i.test(text) ? 0.7 : /left/i.test(text) ? -0.7 : 0)) },
  { toolId: 'audio-stereo-width', input: 'audio', verb: 'adjust the stereo width', run: (file, text) =>
      runAudio(file, 'width', (a, ab) => a.stereoWidth(ab, /narrow|tight|mono/i.test(text) ? 0.5 : /wide|wider|broad/i.test(text) ? 1.6 : 1.3)) },
  { toolId: 'audio-pitch', input: 'audio', verb: 'shift the pitch', run: (file, text) =>
      runAudio(file, 'pitch', (a, ab) => a.pitchShift(ab, parsePitch(text))) },
  { toolId: 'audio-tempo', input: 'audio', verb: 'change the tempo', run: (file, text) =>
      runAudio(file, 'tempo', (a, ab) => a.changeTempo(ab, parseSpeed(text))) },

  // media understanding — read text out of media (output is text, so it can
  // even feed a following text-op in a chain: "transcribe … and remove dupes")
  { toolId: 'image-ocr', input: 'image', verb: 'read the text in it', run: async (file) => {
      const ocr = await import('@/engines/ocr');
      const { text } = await ocr.recognize(file);
      const t = (text ?? '').trim();
      return { kind: 'text', text: t || 'I couldn’t find any text in that image.' };
  } },
  { toolId: 'audio-to-text', input: 'audio', verb: 'transcribe it', run: async (file) => {
      const { transcribe } = await import('@/engines/transcribe');
      const res = await transcribe(file, { size: 'tiny' });
      const t = (res.text ?? '').trim();
      return { kind: 'text', text: t || 'I couldn’t detect any speech in that audio.' };
  } },

  // video — fast still-frame grab (other video ops route to the tool page)
  { toolId: 'video-thumbnail', input: 'video', verb: 'grab a thumbnail', run: (file) => runVideoFrame(file, 'thumbnail') },
  { toolId: 'video-poster', input: 'video', verb: 'grab a poster frame', run: (file) => runVideoFrame(file, 'poster') },
  { toolId: 'audio-volume', input: 'audio', verb: 'adjust the volume', run: (file, text) =>
      runAudio(file, 'volume', (a, ab) => a.gain(ab, parseGain(text))) },
  { toolId: 'audio-speed', input: 'audio', verb: 'change the speed', run: (file, text) =>
      runAudio(file, 'speed', (a, ab) => a.changeSpeed(ab, parseSpeed(text))) },
  { toolId: 'audio-trim', input: 'audio', verb: 'trim it', run: (file, text) =>
      runAudio(file, 'trimmed', (a, ab) => { const { start, end } = parseTrim(text, ab.duration); return a.trim(ab, start, end); }) },

  // image — param-aware (deterministic parsing; far more reliable than a 0.5B at numbers)
  { toolId: 'image-brightness', input: 'image', verb: 'adjust the brightness', run: (file, text) =>
      runImage(file, 'brightness', (f, _t, d) => f.brightness(d, { value: parseAdjust(text, /\b(dark|darker|dim|less)\b/i) })) },
  { toolId: 'image-contrast', input: 'image', verb: 'adjust the contrast', run: (file, text) =>
      runImage(file, 'contrast', (f, _t, d) => f.contrast(d, { value: parseAdjust(text, /\b(less|lower|flat|soft)\b/i) })) },
  { toolId: 'image-saturation', input: 'image', verb: 'adjust the saturation', run: (file, text) =>
      runImage(file, 'saturation', (f, _t, d) => f.saturation(d, { value: parseAdjust(text, /\b(desatur|less|muted|dull|fade)\b/i) })) },
  {
    toolId: 'image-rotate', input: 'image', verb: 'rotate it',
    run: (file, text) => runImage(file, 'rotated', (_f, _t, d) => rotateImageData(d, parseAngle(text))),
  },
  {
    toolId: 'image-compress', input: 'image', verb: 'compress it',
    run: async (file) => {
      const img = await import('@/engines/image');
      const { data } = await img.decode(file);
      const { blob } = await img.encode(data, 'webp', { quality: 60 });
      return { kind: 'image', url: URL.createObjectURL(blob), filename: `${base(file)}-compressed.webp`, note: `${Math.round(blob.size / 1024)} KB`, blob };
    },
  },
  {
    toolId: 'image-resize', input: 'image', verb: 'resize it',
    run: async (file, text) => {
      const img = await import('@/engines/image');
      const { data } = await img.decode(file);
      const dims = parseResize(text, data.width, data.height);
      if (!dims) return { kind: 'text', text: 'What size? e.g. “800 wide”, “1280×720”, or “50%”.' };
      const out = await img.resize(data, { width: dims.w, height: dims.h });
      const { blob } = await img.encode(out, 'png', {});
      return { kind: 'image', url: URL.createObjectURL(blob), filename: `${base(file)}-${dims.w}x${dims.h}.png`, note: `${dims.w}×${dims.h}`, blob };
    },
  },
];

const BY_ID = new Map(LIST.map((c) => [c.toolId, c]));

export function inlineCap(toolId: string): Capability | undefined {
  return BY_ID.get(toolId);
}
