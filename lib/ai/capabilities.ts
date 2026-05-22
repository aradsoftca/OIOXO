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

export type CapInput = 'image' | 'audio';

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

const LIST: Capability[] = [
  // image — unambiguous filters/transforms
  imageCap('image-grayscale', 'grayscale', 'convert it to grayscale', (f, _t, d) => f.grayscale(d)),
  imageCap('image-invert', 'inverted', 'invert the colours', (f, _t, d) => f.invert(d)),
  imageCap('image-sepia', 'sepia', 'apply a sepia tone', (f, _t, d) => f.sepia(d)),
  imageCap('image-vintage', 'vintage', 'give it a vintage look', (f, _t, d) => f.vintage(d)),
  imageCap('image-sharpen', 'sharp', 'sharpen it', (f, _t, d) => f.sharpen(d)),
  imageCap('image-pixelate', 'pixelated', 'pixelate it', (_f, t, d) => t.pixelate(d, { size: 12 })),
  imageCap('image-flip', 'flipped', 'flip it', (_f, t, d) => t.flip(d, { horizontal: true })),
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
