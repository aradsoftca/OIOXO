/**
 * Video Studio WYSIWYG compositor — renders the timeline FRAME BY FRAME on a
 * canvas, reproducing the live preview EXACTLY (multi-track / PiP compositing,
 * per-clip color wheels + RGB curves + keyframed brightness/contrast/saturation/
 * hue/opacity, animated text), then encodes those frames to MP4.
 *
 * This replaces the old `concatClips` export, which honored only a static
 * brightness/contrast/saturation eq on a single video track and silently
 * dropped everything else — the preview looked like DaVinci, the file was a
 * flat concat. Here, OUTPUT == PREVIEW by construction: the export draws with
 * the same math the viewer does.
 *
 * Encode paths (chosen at runtime):
 *   1. WebCodecs VideoEncoder + mp4-muxer (CDN, ~10KB) — hardware-accelerated,
 *      low memory, 1080p/4K friendly. Preferred when available.
 *   2. ffmpeg.wasm image2 frame-pipe — universal fallback, works everywhere
 *      ffmpeg already runs. Frames are streamed in chunks to bound memory.
 *
 * Audio is mixed down separately (all clips / tracks / per-clip fades / speed)
 * via OfflineAudioContext and muxed in. Fully on-device, no server.
 */

import { deviceProfile } from '@/lib/studios/perf';
import {
  applyColorWheelsToImageData, applyCurveSet, isZeroWheels,
  type ColorWheels, type CurveSet,
} from '@/lib/studios/color-wheels';
import { applyLut, type Lut3D } from '@/lib/studios/lut';
import { sampleAnimated, type AnimatedParam } from '@/lib/studios/keyframes';
import { sampleTextAnim, type TextAnimId } from '@/lib/studios/text-animations';
import { buildAudioChain, type AudioEffect } from '@/lib/studios/audio-effects';
import { setupTransition, type TransitionId } from '@/lib/studios/transitions';
import { effectFilterFragment, hasPixelEffects, applyPixelEffects, type VideoEffect } from '@/lib/studios/video-effects';
import { BRAND_DOMAIN } from '@/lib/brand';

// ---- Brand watermark (free tier) --------------------------------------------
// The global canvas-patch (lib/watermark/canvas-patch) stamps toBlob()/toDataURL,
// but the WebCodecs encode path feeds the canvas straight into `new VideoFrame()`
// and never calls toBlob — so it would ship UNbranded. We therefore burn the mark
// directly into every composited frame inside renderTimelineFrame(), gated on this
// module flag. Default ON (free-safe); UsageGateProvider calls
// setVideoWatermark(false) only after confirming a Pro session. The ffmpeg path's
// per-frame canvas carries data-nowm so the global patch does NOT double-stamp it.
let _videoWm = true;
/** Free tier → draw the brand mark on each frame; Pro → clean. */
export function setVideoWatermark(on: boolean): void { _videoWm = on; }

/** Burn a small bottom-right domain mark into the frame (matches the canvas-patch
 *  style: white, soft shadow, ~2.6% of width). Never throws. */
function drawFrameWatermark(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  frameW: number, frameH: number,
): void {
  if (!_videoWm) return;
  try {
    ctx.save();
    (ctx as any).filter = 'none';
    ctx.globalAlpha = 0.55;
    const fontPx = Math.max(12, Math.round(frameW * 0.026));
    const pad = Math.round(frameW * 0.02);
    ctx.font = `600 ${fontPx}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'alphabetic';
    ctx.shadowColor = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur = Math.max(2, Math.round(fontPx * 0.18));
    ctx.shadowOffsetY = 1;
    ctx.fillStyle = '#ffffff';
    ctx.fillText(BRAND_DOMAIN, frameW - pad, frameH - pad);
    ctx.restore();
  } catch { /* never break an export */ }
}

// ---- Timeline model (mirrors the UI's DocState, decoupled so the engine has
// no React dependency) --------------------------------------------------------

export interface CompTrack { id: string; kind: 'video' | 'audio' | 'text'; muted: boolean }

export interface CompVideoClip {
  id: string; kind: 'video'; trackId: string; mediaId: string;
  start: number; srcStart: number; srcEnd: number; speed: number;
  brightness: number; contrast: number; saturation: number; hue: number; opacity: number;
  fit: 'contain' | 'cover';
  /** Optional PiP transform — normalized to frame (0..1 center, scale 1 = fit). */
  transform?: { x: number; y: number; scale: number; rotation: number };
  keyframes?: {
    brightness?: AnimatedParam<number>; contrast?: AnimatedParam<number>;
    saturation?: AnimatedParam<number>; hue?: AnimatedParam<number>; opacity?: AnimatedParam<number>;
    // Motion keyframes (mirror the editor's VideoClipKeyframes): animate the PiP
    // transform so a clip can pan, zoom, grow, or spin over its duration.
    posX?: AnimatedParam<number>; posY?: AnimatedParam<number>;
    scale?: AnimatedParam<number>; rotation?: AnimatedParam<number>;
  };
  colorWheels?: ColorWheels;
  curves?: CurveSet;
  /** Creative LUT (.cube) applied after wheels+curves — a downloadable film look. */
  lut?: Lut3D;
  lutIntensity?: number;
  /** Creative effects + source crop — mirror the editor's VideoClip so export
   *  matches preview. */
  effects?: VideoEffect[];
  crop?: { x: number; y: number; w: number; h: number };
  transition?: TransitionId;
  transDur?: number;
  /** Chroma key (green/blue screen). Keyed pixels become transparent so the
   *  track below shows through. No model — per-pixel distance in RGB. */
  chromaKey?: { color: string; similarity: number; smoothness: number; spill: number };
}

export interface CompAudioClip {
  id: string; kind: 'audio'; trackId: string; mediaId: string;
  start: number; srcStart: number; srcEnd: number; speed: number;
  volume: number; fadeIn: number; fadeOut: number;
  /** Volume automation (keyframed gain, clip-local seconds) + effects rack —
   *  mirror the editor's AudioClip so the export sounds like the preview. */
  volumeKf?: AnimatedParam<number>;
  effects?: AudioEffect[];
}

export interface CompTextClip {
  id: string; kind: 'text'; trackId: string;
  start: number; duration: number; text: string; font: string; size: number;
  color: string; weight: number; italic: boolean;
  outline: boolean; outlineColor: string; outlineWidth: number;
  pos: 'top' | 'center' | 'bottom'; anim: TextAnimId;
  align: CanvasTextAlign;
  /** Free drag position (normalized 0..1, block center). Overrides pos/align. */
  nx?: number; ny?: number;
  /** Manual per-text keyframes (mirror the editor's TextClip.kf) so hand-animated
   *  text (grow/move/spin over time) exports identically to the preview. */
  kf?: { scale?: AnimatedParam<number>; opacity?: AnimatedParam<number>; posX?: AnimatedParam<number>; posY?: AnimatedParam<number>; rotation?: AnimatedParam<number> };
}

export type CompClip = CompVideoClip | CompAudioClip | CompTextClip;

export interface CompMedia {
  id: string; kind: 'video' | 'audio' | 'image'; file: File;
  url: string; width: number; height: number; duration: number;
}

export interface CompDoc {
  width: number; height: number; fps: number; background: string;
  duration: number; tracks: CompTrack[]; clips: CompClip[];
  master: { volume: number; audioFade: boolean; duck?: boolean };
}

export interface ExportOptions {
  /** Requested output resolution; may be capped on weak devices. */
  width: number; height: number; fps: number;
  /** Pro: skip device caps. Free is already bounded by policy levers upstream. */
  isPro?: boolean;
  onProgress?: (ratio: number, stage: string) => void;
}

export interface ExportResult { blob: Blob; width: number; height: number; fps: number; capped: boolean; encoder: 'webcodecs' | 'ffmpeg' }

const clipDuration = (c: CompClip): number =>
  c.kind === 'text' ? c.duration : Math.max(0.04, (c.srcEnd - c.srcStart) / Math.max(0.01, c.speed));
const clipEnd = (c: CompClip) => c.start + clipDuration(c);

function sampleParam(c: CompVideoClip, name: keyof NonNullable<CompVideoClip['keyframes']>, def: number, localT: number): number {
  const kf = c.keyframes?.[name];
  if (!kf || kf.keyframes.length === 0) return def;
  return sampleAnimated(kf, localT);
}

// ---- Frame decoding ----------------------------------------------------------
// Per-clip frame source. WebCodecs would be ideal, but a frame-accurate seek
// loop on a single hidden <video> is robust everywhere and is what the export
// needs (sequential timestamps, not random access). We keep one element per
// media id and seek it precisely per requested source time.

class FrameSource {
  private video?: HTMLVideoElement;
  private image?: HTMLImageElement;
  readonly kind: 'video' | 'image';
  constructor(private media: CompMedia) {
    this.kind = media.kind === 'image' ? 'image' : 'video';
  }
  async init(): Promise<void> {
    if (this.kind === 'image') {
      const img = new Image();
      img.src = this.media.url;
      await new Promise<void>((res) => { img.onload = () => res(); img.onerror = () => res(); });
      this.image = img;
      return;
    }
    const v = document.createElement('video');
    v.src = this.media.url; v.muted = true; v.volume = 0; v.playsInline = true; v.preload = 'auto';
    await new Promise<void>((res) => {
      v.onloadeddata = () => res(); v.onerror = () => res(); setTimeout(res, 6000);
    });
    this.video = v;
  }
  /** Get the decoded frame at source time `t` (seconds). */
  async frameAt(t: number): Promise<CanvasImageSource | null> {
    if (this.image) return this.image;
    const v = this.video;
    if (!v) return null;
    const target = Math.max(0, Math.min(isFinite(v.duration) ? v.duration : t, t));
    if (Math.abs(v.currentTime - target) > 0.01) {
      await new Promise<void>((res) => {
        const onSeek = () => { v.removeEventListener('seeked', onSeek); res(); };
        v.addEventListener('seeked', onSeek);
        try { v.currentTime = target; } catch { res(); }
        setTimeout(res, 500); // never hang the whole export on one bad seek
      });
    }
    return v.readyState >= 2 ? v : null;
  }
  dispose(): void { if (this.video) { this.video.pause(); this.video.src = ''; } }
}

// ---- Chroma key (green/blue screen) — pure per-pixel, no model --------------

const _keyCanvas: { c: HTMLCanvasElement | OffscreenCanvas | null } = { c: null };
function keyScratch(w: number, h: number): { canvas: HTMLCanvasElement | OffscreenCanvas; ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D } {
  if (!_keyCanvas.c) _keyCanvas.c = (typeof OffscreenCanvas !== 'undefined') ? new OffscreenCanvas(w, h) : document.createElement('canvas');
  const cv = _keyCanvas.c as any;
  cv.width = w; cv.height = h;
  return { canvas: cv, ctx: cv.getContext('2d', { willReadFrequently: true }) };
}

/**
 * Remove a key color (green/blue screen) from a frame, returning a canvas with
 * alpha applied. `similarity` = how close to the key counts as background;
 * `smoothness` = soft edge width; `spill` = how much key tint to desaturate on
 * the kept edges. All 0..1. Pure RGB-distance keying — fast, no model.
 */
export function chromaKeySource(src: CanvasImageSource, key: { color: string; similarity: number; smoothness: number; spill: number }): HTMLCanvasElement | OffscreenCanvas | null {
  const sw = (src as any).videoWidth ?? (src as any).naturalWidth ?? (src as any).width ?? 0;
  const sh = (src as any).videoHeight ?? (src as any).naturalHeight ?? (src as any).height ?? 0;
  if (!sw || !sh) return null;
  const { canvas, ctx } = keyScratch(sw, sh);
  try {
    ctx.clearRect(0, 0, sw, sh);
    ctx.drawImage(src, 0, 0, sw, sh);
    const img = ctx.getImageData(0, 0, sw, sh);
    const d = img.data;
    const m = /^#?([0-9a-f]{6})$/i.exec((key.color || '#00ff00').trim());
    const kn = m ? parseInt(m[1], 16) : 0x00ff00;
    const kr = (kn >> 16) & 255, kg = (kn >> 8) & 255, kb = kn & 255;
    const sim = Math.max(0.01, key.similarity) * 442;      // 0..~442 (max RGB dist)
    const smooth = Math.max(0.001, key.smoothness) * 442;
    const spill = Math.max(0, Math.min(1, key.spill));
    for (let i = 0; i < d.length; i += 4) {
      const dr = d[i] - kr, dg = d[i + 1] - kg, db = d[i + 2] - kb;
      const dist = Math.sqrt(dr * dr + dg * dg + db * db);
      if (dist < sim) {
        d[i + 3] = 0;                                       // fully keyed out
      } else if (dist < sim + smooth) {
        d[i + 3] = Math.round(((dist - sim) / smooth) * d[i + 3]); // soft edge
        // spill suppression on the edge: pull green toward the r/b average
        if (spill > 0) { const avg = (d[i] + d[i + 2]) / 2; if (d[i + 1] > avg) d[i + 1] = d[i + 1] + (avg - d[i + 1]) * spill; }
      } else if (spill > 0) {
        const avg = (d[i] + d[i + 2]) / 2; if (d[i + 1] > avg) d[i + 1] = d[i + 1] + (avg - d[i + 1]) * spill * 0.5;
      }
    }
    ctx.putImageData(img, 0, 0);
    return canvas;
  } catch { return null; }
}

// ---- The faithful frame renderer (mirror of the UI's drawPreviewFrame) -------

function drawClipFrame(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  src: CanvasImageSource, frameW: number, frameH: number, c: CompVideoClip, localT: number,
): void {
  const sw = (src as any).videoWidth ?? (src as any).naturalWidth ?? (src as any).width ?? 0;
  const sh = (src as any).videoHeight ?? (src as any).naturalHeight ?? (src as any).height ?? 0;
  if (!sw || !sh) return;
  const sr = sw / sh, dr = frameW / frameH;
  let tw = frameW, th = frameH, tx = 0, ty = 0;
  if (c.fit === 'contain') {
    if (sr > dr) { th = frameW / sr; ty = (frameH - th) / 2; } else { tw = frameH * sr; tx = (frameW - tw) / 2; }
  } else {
    if (sr > dr) { tw = frameH * sr; tx = (frameW - tw) / 2; } else { th = frameW / sr; ty = (frameH - th) / 2; }
  }

  const brightness = sampleParam(c, 'brightness', c.brightness, localT);
  const contrast = sampleParam(c, 'contrast', c.contrast, localT);
  const saturation = sampleParam(c, 'saturation', c.saturation, localT);
  const hue = sampleParam(c, 'hue', c.hue, localT);
  const opacity = sampleParam(c, 'opacity', c.opacity, localT);

  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, opacity / 100));

  // Optional PiP transform around the frame center — each axis can be keyframed
  // (posX/posY/scale/rotation) for motion; falls back to the static transform.
  const baseTf = c.transform ?? { x: 0, y: 0, scale: 1, rotation: 0 };
  const tfX = sampleParam(c, 'posX', baseTf.x, localT);
  const tfY = sampleParam(c, 'posY', baseTf.y, localT);
  const tfScale = sampleParam(c, 'scale', baseTf.scale, localT);
  const tfRot = sampleParam(c, 'rotation', baseTf.rotation, localT);
  if (tfScale !== 1 || tfX !== 0 || tfY !== 0 || tfRot !== 0) {
    const cx = frameW / 2 + tfX * frameW;
    const cy = frameH / 2 + tfY * frameH;
    ctx.translate(cx, cy);
    ctx.rotate((tfRot * Math.PI) / 180);
    ctx.scale(tfScale, tfScale);
    ctx.translate(-frameW / 2, -frameH / 2);
  }

  const fxFrag = effectFilterFragment(c.effects, frameW);
  (ctx as any).filter = `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%) hue-rotate(${hue}deg)${fxFrag ? ' ' + fxFrag : ''}`;
  const cr = c.crop;
  const drawSrc = (img: CanvasImageSource) => {
    if (cr && (cr.x !== 0 || cr.y !== 0 || cr.w !== 1 || cr.h !== 1)) {
      ctx.drawImage(img, cr.x * sw, cr.y * sh, cr.w * sw, cr.h * sh, tx, ty, tw, th);
    } else {
      ctx.drawImage(img, tx, ty, tw, th);
    }
  };
  if (c.chromaKey) {
    // Key the source on its own buffer first, then draw the alpha-bearing
    // result so the track below shows through the keyed-out region.
    const keyed = chromaKeySource(src, c.chromaKey);
    drawSrc(keyed ?? src);
  } else {
    drawSrc(src);
  }
  (ctx as any).filter = 'none';

  // Color wheels + curves operate on pixels (CSS filters can't express them).
  const hasWheels = c.colorWheels && !isZeroWheels(c.colorWheels);
  const hasCurves = c.curves && (c.curves.master || c.curves.r || c.curves.g || c.curves.b);
  const hasLut = !!c.lut && (c.lutIntensity ?? 1) > 0;
  const hasPixFx = hasPixelEffects(c.effects);
  if (hasWheels || hasCurves || hasLut || hasPixFx) {
    try {
      const dx = Math.max(0, Math.floor(tx)), dy = Math.max(0, Math.floor(ty));
      const dwInt = Math.min(frameW - dx, Math.ceil(tw)), dhInt = Math.min(frameH - dy, Math.ceil(th));
      if (dwInt > 0 && dhInt > 0) {
        const img = ctx.getImageData(dx, dy, dwInt, dhInt);
        if (hasWheels) applyColorWheelsToImageData(img.data, c.colorWheels!);
        if (hasCurves) applyCurveSet(img.data, c.curves!);
        if (hasLut) applyLut(img.data, c.lut!, c.lutIntensity ?? 1);
        // Same pixel-effects + grain seed as the preview (localT*1000 rounded) so
        // the exported frame is identical to what the user saw.
        if (hasPixFx) applyPixelEffects(img, c.effects, Math.round(localT * 1000));
        ctx.putImageData(img, dx, dy);
      }
    } catch { /* tainted canvas / OOB — skip pixel grade for this frame */ }
  }
  ctx.restore();
}

function drawTextClip(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  tx: CompTextClip, frameW: number, frameH: number, t: number,
): void {
  // MIRRORS tools/video-studio/ui.tsx drawTextClip EXACTLY (preset animation
  // library + manual keyframes + reveal + blur + block transform). Keep the two
  // in lock-step or captions diverge between preview and the exported file.
  const localT = (t - tx.start) / Math.max(tx.duration, 0.01);
  const u = frameW / 1920;
  const anim = sampleTextAnim(tx.anim, localT, frameW);
  const kfScale = tx.kf?.scale ? sampleAnimated(tx.kf.scale, localT) : 1;
  const kfAlpha = tx.kf?.opacity ? sampleAnimated(tx.kf.opacity, localT) / 100 : 1;
  const kfRot = tx.kf?.rotation ? (sampleAnimated(tx.kf.rotation, localT) * Math.PI) / 180 : 0;
  const kfDX = tx.kf?.posX ? sampleAnimated(tx.kf.posX, localT) * frameW : 0;
  const kfDY = tx.kf?.posY ? sampleAnimated(tx.kf.posY, localT) * frameH : 0;
  const alpha = Math.max(0, anim.alpha * kfAlpha);
  if (alpha <= 0) return;
  const scale = anim.scale * kfScale;
  const rotate = anim.rotate + kfRot;

  ctx.save();
  ctx.globalAlpha = alpha;
  if (anim.blur > 0) (ctx as any).filter = `blur(${anim.blur}px)`;
  ctx.font = `${tx.italic ? 'italic ' : ''}${tx.weight} ${tx.size * u}px ${tx.font}`;
  const freePos = tx.nx != null && tx.ny != null;
  ctx.textAlign = freePos ? 'center' : tx.align;
  ctx.textBaseline = 'middle';
  const fullLines = tx.text.split('\n');
  let lines = fullLines;
  if (anim.reveal < 1) {
    if (tx.anim === 'word-by-word') {
      const words = tx.text.split(/(\s+)/);
      const nShow = Math.ceil(words.filter(w => w.trim()).length * anim.reveal);
      let shown = 0; const out: string[] = [];
      for (const w of words) { if (w.trim()) { if (shown >= nShow) break; shown++; } out.push(w); }
      lines = out.join('').split('\n');
    } else {
      const nChars = Math.ceil(tx.text.length * anim.reveal);
      lines = tx.text.slice(0, nChars).split('\n');
    }
  }
  const lh = tx.size * 1.25 * u;
  const totalH = fullLines.length * lh;
  const yBase = freePos
    ? tx.ny! * frameH - totalH / 2 + lh / 2
    : tx.pos === 'top' ? frameH * 0.12 + lh / 2
    : tx.pos === 'center' ? frameH / 2 - totalH / 2 + lh / 2
    : frameH - frameH * 0.12 - totalH + lh / 2;
  const xBase = freePos ? tx.nx! * frameW
    : tx.align === 'center' ? frameW / 2 : tx.align === 'right' ? frameW - 60 : 60;
  const blockCX = xBase + anim.dx + kfDX;
  const blockCY = yBase + totalH / 2 - lh / 2 + anim.dy + kfDY;
  if (scale !== 1 || rotate !== 0) {
    ctx.translate(blockCX, blockCY);
    ctx.rotate(rotate);
    ctx.scale(scale, scale);
    ctx.translate(-blockCX, -blockCY);
  }
  const drawX = xBase + anim.dx + kfDX;
  const drawY0 = yBase + anim.dy + kfDY;
  for (let i = 0; i < lines.length; i++) {
    const yy = drawY0 + i * lh;
    if (tx.outline) {
      ctx.lineJoin = 'round';
      ctx.lineWidth = Math.max(2, tx.outlineWidth * u);
      ctx.strokeStyle = tx.outlineColor;
      ctx.strokeText(lines[i], drawX, yy);
    }
    ctx.fillStyle = tx.color;
    ctx.fillText(lines[i], drawX, yy);
  }
  (ctx as any).filter = 'none';
  ctx.restore();
}

/**
 * Render the entire composited frame at time `t` onto `ctx`. Mirrors the UI's
 * drawPreviewFrame: every video track bottom-to-top, then text. This is the
 * single source of WYSIWYG truth.
 */
export async function renderTimelineFrame(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  doc: CompDoc, sources: Map<string, FrameSource>, mediaMap: Map<string, CompMedia>,
  frameW: number, frameH: number, t: number,
): Promise<void> {
  ctx.save();
  (ctx as any).filter = 'none';
  ctx.globalAlpha = 1;
  ctx.fillStyle = doc.background;
  ctx.fillRect(0, 0, frameW, frameH);
  ctx.restore();

  const videoTracks = doc.tracks.filter((tr) => tr.kind === 'video');
  // Bottom-to-top: V1 is the base, V2+ composite over it (PiP / overlays).
  for (let i = videoTracks.length - 1; i >= 0; i--) {
    const tr = videoTracks[i];
    const trackClips = (doc.clips.filter((cl) => cl.trackId === tr.id && cl.kind === 'video') as CompVideoClip[]).sort((a, b) => a.start - b.start);
    const ai = trackClips.findIndex((cl) => t >= cl.start && t < clipEnd(cl));
    const active = ai >= 0 ? trackClips[ai] : undefined;
    if (!active) continue;
    const media = mediaMap.get(active.mediaId);
    const fs = sources.get(active.mediaId);
    if (!media || !fs) continue;
    const localT = t - active.start;

    // Cross-clip transition: during this clip's opening `transDur`, blend the
    // OUTGOING (previous) clip underneath so a real fade/wipe happens, not the
    // hard cut the old phantom-field code produced.
    const transDur = active.transDur ?? 0.5;
    const inTransition = !!active.transition && active.transition !== 'none' && localT < transDur && ai > 0;
    if (inTransition) {
      const prev = trackClips[ai - 1];
      const prevFs = sources.get(prev.mediaId);
      if (prevFs) {
        // Hold the previous clip on its final frame for the overlap.
        const prevLocal = clipDuration(prev);
        const prevSrc = prevLocal * prev.speed + prev.srcStart;
        const prevFrame = await prevFs.frameAt(Math.max(0, prevSrc - 0.04));
        if (prevFrame) drawClipFrame(ctx, prevFrame, frameW, frameH, prev, prevLocal);
      }
    }

    const srcTime = localT * active.speed + active.srcStart;
    const frame = await fs.frameAt(srcTime);
    if (!frame) continue;
    if (inTransition) {
      const p = Math.min(1, localT / transDur); // 0→1 across the transition
      ctx.save();
      // Shared transition library — identical setup in preview + export.
      setupTransition(ctx, active.transition as TransitionId, p, frameW, frameH);
      drawClipFrame(ctx, frame, frameW, frameH, active, localT);
      (ctx as any).filter = 'none';
      ctx.restore();
    } else {
      drawClipFrame(ctx, frame, frameW, frameH, active, localT);
    }
  }

  const textTrack = doc.tracks.find((tr) => tr.kind === 'text');
  if (textTrack) {
    const txts = doc.clips.filter((cl) => cl.trackId === textTrack.id && cl.kind === 'text' && t >= cl.start && t < clipEnd(cl)) as CompTextClip[];
    for (const tx of txts) drawTextClip(ctx, tx, frameW, frameH, t);
  }

  // Brand mark LAST, over all content (free tier only). Covers BOTH the WebCodecs
  // and ffmpeg encode paths uniformly since both render through this function.
  drawFrameWatermark(ctx, frameW, frameH);
}

// ---- Audio mixdown (ALL clips/tracks, per-clip fades + speed) ----------------

async function mixAudio(doc: CompDoc, mediaMap: Map<string, CompMedia>): Promise<AudioBuffer | null> {
  const audioClips = doc.clips.filter((c): c is CompAudioClip => c.kind === 'audio');
  // Video clips can also carry audio; include their tracks if not muted.
  const sampleRate = 44100;
  const totalDur = Math.max(0.1, doc.duration);
  const OfflineCtx: typeof OfflineAudioContext =
    (window as any).OfflineAudioContext || (window as any).webkitOfflineAudioContext;
  if (!OfflineCtx) return null;
  const ctx = new OfflineCtx(2, Math.ceil(totalDur * sampleRate), sampleRate);

  const decodeCache = new Map<string, AudioBuffer>();
  const decode = async (media: CompMedia): Promise<AudioBuffer | null> => {
    if (decodeCache.has(media.id)) return decodeCache.get(media.id)!;
    try {
      const ab = await media.file.arrayBuffer();
      const buf = await ctx.decodeAudioData(ab.slice(0));
      decodeCache.set(media.id, buf);
      return buf;
    } catch { return null; }
  };

  const masterVol = Math.max(0, Math.min(2, doc.master.volume));
  // Place one audio clip into the given context (gain envelope + effects).
  const placeClip = (targetCtx: OfflineAudioContext, ac: CompAudioClip, buf: AudioBuffer): void => {
    const node = targetCtx.createBufferSource();
    node.buffer = buf;
    node.playbackRate.value = Math.max(0.25, Math.min(4, ac.speed || 1));
    const gain = targetCtx.createGain();
    const startAt = Math.max(0, ac.start);
    const dur = clipEnd(ac) - ac.start;
    const g = gain.gain;
    if (ac.volumeKf && ac.volumeKf.keyframes.length) {
      const kfs = ac.volumeKf.keyframes;
      g.setValueAtTime(Math.max(0, kfs[0].value) * masterVol, startAt);
      for (const k of kfs) {
        const at = startAt + Math.max(0, Math.min(dur, k.t));
        g.linearRampToValueAtTime(Math.max(0, k.value) * masterVol, at);
      }
    } else {
      const vol = Math.max(0, Math.min(2, (ac.volume ?? 1) * masterVol));
      g.setValueAtTime(ac.fadeIn > 0 ? 0 : vol, startAt);
      if (ac.fadeIn > 0) g.linearRampToValueAtTime(vol, startAt + Math.min(ac.fadeIn, dur));
      if (ac.fadeOut > 0) {
        g.setValueAtTime(vol, Math.max(startAt, startAt + dur - ac.fadeOut));
        g.linearRampToValueAtTime(0, startAt + dur);
      }
    }
    const chain = buildAudioChain(targetCtx, ac.effects);
    if (chain.pitchSemitones) {
      try { node.detune.value = chain.pitchSemitones * 100; } catch { /* detune unsupported */ }
    }
    node.connect(chain.input);
    chain.output.connect(gain).connect(targetCtx.destination);
    node.start(startAt, Math.max(0, ac.srcStart), dur * (node.playbackRate.value));
  };

  // Classify clips: with ducking ON, audio on the FIRST audio track (A1) is the
  // "voice" and audio on OTHER audio tracks is "music" that gets ducked under it
  // (the CapCut/Premiere convention: voiceover on A1, music below). Without
  // ducking everything mixes together as before.
  const audioTrackIds = doc.tracks.filter((t) => t.kind === 'audio').map((t) => t.id);
  const voiceTrackId = audioTrackIds[0];
  const duckOn = !!doc.master.duck && audioTrackIds.length >= 2;

  const liveClips: { ac: CompAudioClip; buf: AudioBuffer; isVoice: boolean }[] = [];
  for (const ac of audioClips) {
    const tr = doc.tracks.find((t) => t.id === ac.trackId);
    if (!tr || tr.muted) continue;
    const media = mediaMap.get(ac.mediaId);
    if (!media) continue;
    const buf = await decode(media);
    if (!buf) continue;
    liveClips.push({ ac, buf, isVoice: ac.trackId === voiceTrackId });
  }
  if (!liveClips.length) return null;

  if (!duckOn || !liveClips.some((c) => c.isVoice) || !liveClips.some((c) => !c.isVoice)) {
    // No ducking (or nothing to duck): single combined render, as before.
    for (const c of liveClips) placeClip(ctx, c.ac, c.buf);
    const rendered = await ctx.startRendering();
    if (doc.master.audioFade) applyMasterFade(rendered, 0.5, 0.6);
    return rendered;
  }

  // DUCKING: render voice and music separately, derive a speech-presence
  // envelope from the voice mix, attenuate music where speech is present, sum.
  const frames = Math.ceil(totalDur * sampleRate);
  const voiceCtx = new OfflineCtx(2, frames, sampleRate);
  const musicCtx = new OfflineCtx(2, frames, sampleRate);
  for (const c of liveClips) placeClip(c.isVoice ? voiceCtx : musicCtx, c.ac, c.buf);
  const [voiceBuf, musicBuf] = await Promise.all([voiceCtx.startRendering(), musicCtx.startRendering()]);

  const duckGain = computeDuckEnvelope(voiceBuf, sampleRate, { floor: 0.25, threshold: 0.02, attack: 0.08, release: 0.4 });
  // Sum: voice + music*duckGain, into a fresh buffer.
  const outCtx = new OfflineCtx(2, frames, sampleRate);
  const outBuf = outCtx.createBuffer(2, frames, sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const out = outBuf.getChannelData(ch);
    const v = voiceBuf.getChannelData(Math.min(ch, voiceBuf.numberOfChannels - 1));
    const m = musicBuf.getChannelData(Math.min(ch, musicBuf.numberOfChannels - 1));
    for (let i = 0; i < frames; i++) out[i] = v[i] + m[i] * duckGain[i];
  }
  if (doc.master.audioFade) applyMasterFade(outBuf, 0.5, 0.6);
  return outBuf;
}

/**
 * Speech-presence ducking envelope from a voice buffer. Short-window RMS gates a
 * gain that drops to `floor` while speech is present and returns to 1 in the
 * gaps, with attack/release smoothing so the music dip is musical (no clicks).
 * Returns a per-sample gain array to multiply the music by.
 */
function computeDuckEnvelope(
  voice: AudioBuffer,
  sampleRate: number,
  opts: { floor: number; threshold: number; attack: number; release: number },
): Float32Array {
  const n = voice.length;
  const ch0 = voice.getChannelData(0);
  const ch1 = voice.numberOfChannels > 1 ? voice.getChannelData(1) : ch0;
  // Short-term RMS over ~20ms windows → speech presence (1) or gap (0).
  const win = Math.max(1, Math.round(sampleRate * 0.02));
  const present = new Float32Array(n);
  let acc = 0;
  // running sum of squares over the window (mono mix)
  const sq = (i: number) => { const s = 0.5 * (ch0[i] + ch1[i]); return s * s; };
  for (let i = 0; i < n; i++) {
    acc += sq(i);
    if (i >= win) acc -= sq(i - win);
    const rms = Math.sqrt(acc / Math.min(i + 1, win));
    present[i] = rms > opts.threshold ? 1 : 0;
  }
  // Attack/release smoothing toward the target gain (floor when present, 1 in gaps).
  const gain = new Float32Array(n);
  const atkCoef = Math.exp(-1 / Math.max(1, opts.attack * sampleRate));
  const relCoef = Math.exp(-1 / Math.max(1, opts.release * sampleRate));
  let g = 1;
  for (let i = 0; i < n; i++) {
    const target = present[i] ? opts.floor : 1;
    const coef = target < g ? atkCoef : relCoef; // duck fast, recover slow
    g = target + (g - target) * coef;
    gain[i] = g;
  }
  return gain;
}

function applyMasterFade(buf: AudioBuffer, inSec: number, outSec: number): void {
  const sr = buf.sampleRate;
  const inN = Math.floor(inSec * sr), outN = Math.floor(outSec * sr);
  for (let ch = 0; ch < buf.numberOfChannels; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < inN && i < d.length; i++) d[i] *= i / inN;
    for (let i = 0; i < outN && i < d.length; i++) d[d.length - 1 - i] *= i / outN;
  }
}

function audioBufferToWav(buf: AudioBuffer): Blob {
  const numCh = buf.numberOfChannels, sr = buf.sampleRate;
  const len = buf.length * numCh * 2 + 44;
  const ab = new ArrayBuffer(len);
  const view = new DataView(ab);
  const w = (off: number, s: string) => { for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); view.setUint32(4, len - 8, true); w(8, 'WAVE'); w(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, numCh, true);
  view.setUint32(24, sr, true); view.setUint32(28, sr * numCh * 2, true);
  view.setUint16(32, numCh * 2, true); view.setUint16(34, 16, true); w(36, 'data');
  view.setUint32(40, len - 44, true);
  let off = 44;
  for (let i = 0; i < buf.length; i++) {
    for (let ch = 0; ch < numCh; ch++) {
      let s = Math.max(-1, Math.min(1, buf.getChannelData(ch)[i]));
      view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true); off += 2;
    }
  }
  return new Blob([view], { type: 'audio/wav' });
}

// ---- Adaptive quality cap ----------------------------------------------------

const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);

/**
 * Resolve the actual export dimensions. CRITICAL: the output MUST keep the
 * PROJECT's aspect ratio (doc.width:doc.height), because the preview always
 * composites at that aspect. If we honored a preset whose aspect differs, the
 * contain/cover fit + text positioning would render differently than what the
 * user saw — breaking WYSIWYG. So we treat the requested preset purely as a
 * resolution *budget* (its longest edge) and fit the project aspect into it,
 * then apply the device cap.
 */
function capQuality(doc: CompDoc, opts: ExportOptions): { width: number; height: number; fps: number; capped: boolean } {
  const aspect = doc.width / doc.height;
  const reqLong = Math.max(opts.width, opts.height);

  // Device cap (perf policy: never freeze/crash). Pro / high-tier = no cap.
  let maxLong = reqLong;
  let capped = false;
  let fps = opts.fps;
  if (!opts.isPro) {
    const p = deviceProfile();
    if (p.tier !== 'high') {
      const tierMax = p.tier === 'low' ? 1080 : 1440;
      if (reqLong > tierMax) { maxLong = tierMax; capped = true; }
      if (fps > 30) { fps = 30; capped = true; }
    }
  }

  // Fit the project aspect into the longest-edge budget.
  let width: number, height: number;
  if (aspect >= 1) { width = maxLong; height = maxLong / aspect; }
  else { height = maxLong; width = maxLong * aspect; }
  return { width: even(width), height: even(height), fps, capped };
}

// ---- Main export -------------------------------------------------------------

export async function exportTimeline(doc: CompDoc, media: CompMedia[], opts: ExportOptions): Promise<ExportResult> {
  const { width, height, fps, capped } = capQuality(doc, opts);
  const mediaMap = new Map<string, CompMedia>();
  for (const m of media) mediaMap.set(m.id, m);
  if (!mediaMap.size) throw new Error('No media attached to timeline');

  // Init a frame source per referenced video/image media.
  const usedMediaIds = new Set(doc.clips.filter((c) => c.kind === 'video').map((c) => (c as CompVideoClip).mediaId));
  const sources = new Map<string, FrameSource>();
  for (const id of usedMediaIds) {
    const m = mediaMap.get(id);
    if (!m || m.kind === 'audio') continue;
    const fs = new FrameSource(m);
    await fs.init();
    sources.set(id, fs);
  }

  try {
    opts.onProgress?.(0, 'Mixing audio');
    const audioBuf = await mixAudio(doc, mediaMap);

    const p = deviceProfile();
    const useWebCodecs = p.hasWebCodecs && typeof (window as any).VideoEncoder !== 'undefined';

    if (useWebCodecs) {
      try {
        const blob = await encodeWebCodecs(doc, sources, mediaMap, width, height, fps, audioBuf, opts.onProgress);
        return { blob, width, height, fps, capped, encoder: 'webcodecs' };
      } catch (e) {
        // Fall through to ffmpeg if WebCodecs config/encode failed.
        opts.onProgress?.(0, 'Falling back to compatible encoder');
      }
    }
    const blob = await encodeFfmpeg(doc, sources, mediaMap, width, height, fps, audioBuf, opts.onProgress);
    return { blob, width, height, fps, capped, encoder: 'ffmpeg' };
  } finally {
    sources.forEach((s) => s.dispose());
  }
}

// ---- WebCodecs encode path ---------------------------------------------------

async function encodeWebCodecs(
  doc: CompDoc, sources: Map<string, FrameSource>, mediaMap: Map<string, CompMedia>,
  width: number, height: number, fps: number, audioBuf: AudioBuffer | null,
  onProgress?: (r: number, s: string) => void,
): Promise<Blob> {
  const muxerMod: any = await (new Function('u', 'return import(u)'))('https://cdn.jsdelivr.net/npm/mp4-muxer@5/build/mp4-muxer.mjs');
  const { Muxer, ArrayBufferTarget } = muxerMod;

  const target = new ArrayBufferTarget();
  const muxer = new Muxer({
    target,
    video: { codec: 'avc', width, height },
    audio: audioBuf ? { codec: 'aac', sampleRate: audioBuf.sampleRate, numberOfChannels: Math.min(2, audioBuf.numberOfChannels) } : undefined,
    fastStart: 'in-memory',
  });

  const VideoEncoderCls: any = (window as any).VideoEncoder;
  const encoder = new VideoEncoderCls({
    output: (chunk: any, meta: any) => muxer.addVideoChunk(chunk, meta),
    error: (e: any) => { throw e; },
  });
  encoder.configure({
    codec: 'avc1.640028', width, height,
    bitrate: Math.round(width * height * fps * 0.1),
    framerate: fps,
  });

  const canvas = (typeof OffscreenCanvas !== 'undefined') ? new OffscreenCanvas(width, height) : Object.assign(document.createElement('canvas'), { width, height });
  const ctx = (canvas as any).getContext('2d', { willReadFrequently: true });

  const totalFrames = Math.max(1, Math.ceil(doc.duration * fps));
  const VideoFrameCls: any = (window as any).VideoFrame;
  for (let f = 0; f < totalFrames; f++) {
    const t = f / fps;
    await renderTimelineFrame(ctx, doc, sources, mediaMap, width, height, t);
    const frame = new VideoFrameCls(canvas as any, { timestamp: Math.round((f / fps) * 1_000_000), duration: Math.round(1_000_000 / fps) });
    encoder.encode(frame, { keyFrame: f % (fps * 2) === 0 });
    frame.close();
    if (encoder.encodeQueueSize > 8) await new Promise((r) => setTimeout(r, 0)); // backpressure → bound memory
    if (f % 5 === 0) onProgress?.(0.1 + 0.8 * (f / totalFrames), 'Rendering frames');
  }
  await encoder.flush();
  encoder.close();

  // Audio: encode the mixed buffer via WebCodecs AudioEncoder if present.
  if (audioBuf && typeof (window as any).AudioEncoder !== 'undefined') {
    try { await encodeAudioWebCodecs(audioBuf, muxer); } catch { /* leave video-only */ }
  }

  muxer.finalize();
  onProgress?.(1, 'Done');
  return new Blob([target.buffer], { type: 'video/mp4' });
}

async function encodeAudioWebCodecs(buf: AudioBuffer, muxer: any): Promise<void> {
  const AudioEncoderCls: any = (window as any).AudioEncoder;
  const AudioDataCls: any = (window as any).AudioData;
  const numCh = Math.min(2, buf.numberOfChannels);
  const sr = buf.sampleRate;
  const enc = new AudioEncoderCls({
    output: (chunk: any, meta: any) => muxer.addAudioChunk(chunk, meta),
    error: (e: any) => { throw e; },
  });
  enc.configure({ codec: 'mp4a.40.2', sampleRate: sr, numberOfChannels: numCh, bitrate: 160000 });
  const frameSize = 1024;
  const interleaved = new Float32Array(frameSize * numCh);
  for (let i = 0; i < buf.length; i += frameSize) {
    const n = Math.min(frameSize, buf.length - i);
    for (let ch = 0; ch < numCh; ch++) {
      const cd = buf.getChannelData(ch);
      for (let j = 0; j < n; j++) interleaved[j * numCh + ch] = cd[i + j];
    }
    const data = new AudioDataCls({
      format: 'f32', sampleRate: sr, numberOfFrames: n, numberOfChannels: numCh,
      timestamp: Math.round((i / sr) * 1_000_000), data: interleaved.subarray(0, n * numCh),
    });
    enc.encode(data); data.close();
  }
  await enc.flush(); enc.close();
}

// ---- ffmpeg.wasm fallback path (frame-pipe) ----------------------------------

async function encodeFfmpeg(
  doc: CompDoc, sources: Map<string, FrameSource>, mediaMap: Map<string, CompMedia>,
  width: number, height: number, fps: number, audioBuf: AudioBuffer | null,
  onProgress?: (r: number, s: string) => void,
): Promise<Blob> {
  const { runFfmpegMulti } = await import('@/engines/ffmpeg');
  const canvas = Object.assign(document.createElement('canvas'), { width, height });
  // renderTimelineFrame() already burns the brand mark into each frame, so opt this
  // per-frame canvas OUT of the global toBlob watermark patch to avoid a double mark.
  canvas.dataset.nowm = '1';
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;

  const totalFrames = Math.max(1, Math.ceil(doc.duration * fps));
  const frames: { name: string; data: Blob }[] = [];
  for (let f = 0; f < totalFrames; f++) {
    const t = f / fps;
    await renderTimelineFrame(ctx, doc, sources, mediaMap, width, height, t);
    const blob: Blob = await new Promise((res, rej) => canvas.toBlob((b) => b ? res(b) : rej(new Error('frame encode failed')), 'image/jpeg', 0.92));
    frames.push({ name: `f${String(f).padStart(6, '0')}.jpg`, data: blob });
    if (f % 5 === 0) onProgress?.(0.1 + 0.7 * (f / totalFrames), 'Rendering frames');
  }

  const inputs: { name: string; data: Blob }[] = [...frames];
  if (audioBuf) inputs.push({ name: 'audio.wav', data: audioBufferToWav(audioBuf) });

  onProgress?.(0.85, 'Encoding video');
  return runFfmpegMulti({
    inputs,
    outputName: 'out.mp4',
    args: (_names, o) => {
      const a: string[] = ['-framerate', String(fps), '-i', 'f%06d.jpg'];
      if (audioBuf) a.push('-i', 'audio.wav');
      a.push(
        '-c:v', 'libx264', '-preset', 'fast', '-crf', '20', '-pix_fmt', 'yuv420p',
        ...(audioBuf ? ['-c:a', 'aac', '-b:a', '160k', '-shortest'] : []),
        '-movflags', '+faststart', o,
      );
      return a;
    },
    mimeType: 'video/mp4',
    onProgress: (p) => onProgress?.(0.85 + 0.15 * p, 'Encoding video'),
  });
}
