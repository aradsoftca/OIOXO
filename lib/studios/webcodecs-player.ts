import { LRUCache, deviceProfile } from './perf';

export interface FrameRequest {
  time: number;
  callback: (bitmap: ImageBitmap | null) => void;
}

interface DemuxedClip {
  url: string;
  file: File;
  width: number;
  height: number;
  duration: number;
  ready: boolean;
  decoder?: any;
  htmlVideo?: HTMLVideoElement;
  useHtml: boolean;
  frameCache: LRUCache<number, ImageBitmap>;
  pendingTime: number | null;
  inflight: boolean;
}

export class WebCodecsPlayer {
  private clips = new Map<string, DemuxedClip>();
  private bitmapCap: number;
  private useHtmlAlways: boolean;

  constructor() {
    const p = deviceProfile();
    this.bitmapCap = p.tier === 'high' ? 60 : p.tier === 'mid' ? 30 : 16;
    this.useHtmlAlways = !p.hasWebCodecs;
  }

  async addClip(id: string, file: File): Promise<{ width: number; height: number; duration: number } | null> {
    if (this.clips.has(id)) {
      const c = this.clips.get(id)!;
      return { width: c.width, height: c.height, duration: c.duration };
    }
    const url = URL.createObjectURL(file);
    const v = document.createElement('video');
    v.src = url;
    v.muted = true;
    v.playsInline = true;
    v.preload = 'auto';
    v.crossOrigin = 'anonymous';
    await new Promise<void>((res) => {
      v.onloadedmetadata = () => res();
      v.onerror = () => res();
      setTimeout(res, 4000);
    });
    const width = v.videoWidth || 0;
    const height = v.videoHeight || 0;
    const duration = isFinite(v.duration) ? v.duration : 0;
    if (!width || !height) {
      URL.revokeObjectURL(url);
      return null;
    }
    const clip: DemuxedClip = {
      url, file, width, height, duration,
      ready: true,
      htmlVideo: v,
      useHtml: true,
      frameCache: new LRUCache(this.bitmapCap, (_k, bm) => { try { bm.close?.(); } catch {} }),
      pendingTime: null,
      inflight: false,
    };
    this.clips.set(id, clip);
    return { width, height, duration };
  }

  removeClip(id: string): void {
    const c = this.clips.get(id);
    if (!c) return;
    c.frameCache.clear();
    if (c.htmlVideo) { c.htmlVideo.pause(); c.htmlVideo.src = ''; }
    URL.revokeObjectURL(c.url);
    this.clips.delete(id);
  }

  hasClip(id: string): boolean { return this.clips.has(id) }

  async frameAt(id: string, time: number, quantize = 1 / 15): Promise<ImageBitmap | null> {
    const c = this.clips.get(id);
    if (!c || !c.ready) return null;
    const key = Math.round(time / quantize) * quantize;
    const cached = c.frameCache.get(key);
    if (cached) return cached;
    if (c.useHtml) return await this.seekHtmlAndGrab(c, key);
    return null;
  }

  private async seekHtmlAndGrab(c: DemuxedClip, key: number): Promise<ImageBitmap | null> {
    if (!c.htmlVideo) return null;
    const v = c.htmlVideo;
    if (c.inflight) {
      c.pendingTime = key;
      return null;
    }
    c.inflight = true;
    try {
      const target = Math.max(0, Math.min(c.duration, key));
      if (Math.abs(v.currentTime - target) > 0.04) {
        try { v.currentTime = target; } catch { c.inflight = false; return null; }
        await new Promise<void>((res) => {
          const onSeek = () => { v.removeEventListener('seeked', onSeek); res(); };
          v.addEventListener('seeked', onSeek);
          setTimeout(res, 200);
        });
      }
      if (v.readyState < 2) return null;
      let bitmap: ImageBitmap | null = null;
      try { bitmap = await createImageBitmap(v); } catch { return null; }
      c.frameCache.set(key, bitmap);
      return bitmap;
    } finally {
      c.inflight = false;
      if (c.pendingTime != null && c.pendingTime !== key) {
        const next = c.pendingTime;
        c.pendingTime = null;
        void this.seekHtmlAndGrab(c, next);
      }
    }
  }

  prewarm(id: string, times: number[]): void {
    const c = this.clips.get(id);
    if (!c) return;
    void (async () => {
      for (const t of times) {
        if (c.frameCache.has(Math.round(t * 15) / 15)) continue;
        await this.seekHtmlAndGrab(c, t);
      }
    })();
  }

  dispose(): void {
    for (const id of Array.from(this.clips.keys())) this.removeClip(id);
  }
}

export interface RenderOptions {
  width: number;
  height: number;
  background: string;
  fit: 'contain' | 'cover';
  filter?: string;
  opacity?: number;
}

export function blitFrameToCanvas(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  bitmap: ImageBitmap | HTMLImageElement | HTMLVideoElement,
  opts: RenderOptions,
): void {
  const sw = ('width' in bitmap ? bitmap.width : 0) || (bitmap as any).naturalWidth || (bitmap as any).videoWidth || 0;
  const sh = ('height' in bitmap ? bitmap.height : 0) || (bitmap as any).naturalHeight || (bitmap as any).videoHeight || 0;
  if (!sw || !sh) return;
  const dw = opts.width, dh = opts.height;
  const sr = sw / sh, dr = dw / dh;
  let tw = dw, th = dh, tx = 0, ty = 0;
  if (opts.fit === 'contain') {
    if (sr > dr) { th = dw / sr; ty = (dh - th) / 2 }
    else { tw = dh * sr; tx = (dw - tw) / 2 }
  } else {
    if (sr > dr) { tw = dh * sr; tx = (dw - tw) / 2 }
    else { th = dw / sr; ty = (dh - th) / 2 }
  }
  ctx.save();
  if (opts.opacity != null) ctx.globalAlpha = opts.opacity;
  if (opts.filter) ctx.filter = opts.filter;
  ctx.drawImage(bitmap as any, tx, ty, tw, th);
  ctx.filter = 'none';
  ctx.restore();
}
