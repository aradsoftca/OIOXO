import * as React from 'react';

export class LRUCache<K, V> {
  private map = new Map<K, V>();
  constructor(private capacity: number, private onEvict?: (k: K, v: V) => void) {}
  get(k: K): V | undefined {
    const v = this.map.get(k);
    if (v === undefined) return undefined;
    this.map.delete(k);
    this.map.set(k, v);
    return v;
  }
  set(k: K, v: V): void {
    if (this.map.has(k)) this.map.delete(k);
    this.map.set(k, v);
    while (this.map.size > this.capacity) {
      const firstKey = this.map.keys().next().value as K;
      const ev = this.map.get(firstKey)!;
      this.map.delete(firstKey);
      this.onEvict?.(firstKey, ev);
    }
  }
  delete(k: K): void {
    const v = this.map.get(k);
    if (v !== undefined && this.onEvict) this.onEvict(k, v);
    this.map.delete(k);
  }
  has(k: K): boolean { return this.map.has(k) }
  clear(): void {
    if (this.onEvict) for (const [k, v] of this.map) this.onEvict(k, v);
    this.map.clear();
  }
  get size(): number { return this.map.size }
}

export function useRafThrottle<T extends (...args: any[]) => void>(fn: T): T {
  const fnRef = React.useRef(fn);
  fnRef.current = fn;
  const pending = React.useRef<{ args: any[]; raf: number } | null>(null);
  // Cancel any in-flight RAF on unmount so the wrapped fn doesn't fire
  // against an unmounted component (silent in React 18, but it still runs
  // user callbacks that may touch refs / dispatch state).
  React.useEffect(() => () => {
    if (pending.current) {
      cancelAnimationFrame(pending.current.raf);
      pending.current = null;
    }
  }, []);
  return React.useCallback(((...args: any[]) => {
    if (pending.current) {
      pending.current.args = args;
      return;
    }
    const raf = requestAnimationFrame(() => {
      const p = pending.current;
      pending.current = null;
      if (p) fnRef.current(...p.args);
    });
    pending.current = { args, raf };
  }) as T, []);
}

export function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = React.useState(value);
  React.useEffect(() => {
    const id = window.setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

export function useIdleCallback(fn: () => void, deps: React.DependencyList): void {
  React.useEffect(() => {
    const w = window as any;
    if (w.requestIdleCallback) {
      const id = w.requestIdleCallback(fn);
      return () => w.cancelIdleCallback?.(id);
    }
    const id = window.setTimeout(fn, 1);
    return () => clearTimeout(id);
  }, deps);
}

export function useResizeObserver(ref: React.RefObject<HTMLElement>, onResize: (r: { width: number; height: number }) => void) {
  const callbackRef = React.useRef(onResize);
  callbackRef.current = onResize;
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      const e = entries[0];
      if (e) callbackRef.current({ width: e.contentRect.width, height: e.contentRect.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
}

export function useThrottledValue<T>(value: T, ms: number): T {
  const [throttled, setThrottled] = React.useState(value);
  const last = React.useRef(Date.now());
  const timer = React.useRef<number | null>(null);
  React.useEffect(() => {
    const now = Date.now();
    const elapsed = now - last.current;
    if (elapsed >= ms) {
      last.current = now;
      setThrottled(value);
    } else {
      if (timer.current) clearTimeout(timer.current);
      timer.current = window.setTimeout(() => {
        last.current = Date.now();
        setThrottled(value);
      }, ms - elapsed);
    }
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [value, ms]);
  return throttled;
}

export interface DeviceProfile {
  cores: number;
  memoryGB: number;
  tier: 'low' | 'mid' | 'high';
  prefersReducedMotion: boolean;
  isMobile: boolean;
  hasWebGPU: boolean;
  hasWebCodecs: boolean;
  hasOffscreenCanvas: boolean;
}

let _profile: DeviceProfile | null = null;

export function deviceProfile(): DeviceProfile {
  if (_profile) return _profile;
  if (typeof navigator === 'undefined') {
    return { cores: 4, memoryGB: 4, tier: 'mid', prefersReducedMotion: false, isMobile: false, hasWebGPU: false, hasWebCodecs: false, hasOffscreenCanvas: false };
  }
  const cores = navigator.hardwareConcurrency ?? 4;
  const memoryGB = (navigator as any).deviceMemory ?? 4;
  const isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  const tier: DeviceProfile['tier'] =
    (cores >= 6 && memoryGB >= 6) ? 'high'
    : (cores >= 3 && memoryGB >= 3) ? 'mid'
    : 'low';
  const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  const hasWebGPU = !!(navigator as any).gpu;
  const hasWebCodecs = typeof (window as any).VideoDecoder !== 'undefined';
  const hasOffscreenCanvas = typeof OffscreenCanvas !== 'undefined';
  _profile = { cores, memoryGB, tier, prefersReducedMotion, isMobile, hasWebGPU, hasWebCodecs, hasOffscreenCanvas };
  return _profile;
}

export interface LayerCacheEntry {
  canvas: HTMLCanvasElement;
  hash: string;
}

export class LayerCompositeCache {
  private cache = new Map<string, LayerCacheEntry>();
  constructor(private cap = 32) {}

  get(layerId: string, hash: string): HTMLCanvasElement | null {
    const e = this.cache.get(layerId);
    if (e && e.hash === hash) return e.canvas;
    return null;
  }

  set(layerId: string, hash: string, canvas: HTMLCanvasElement): void {
    this.cache.set(layerId, { canvas, hash });
    while (this.cache.size > this.cap) {
      const first = this.cache.keys().next().value as string | undefined;
      if (first) this.cache.delete(first);
    }
  }

  invalidate(layerId: string): void { this.cache.delete(layerId); }
  clear(): void { this.cache.clear(); }
}

export function makeRenderScheduler(): { schedule: (fn: () => void) => void; flush: () => void; dispose: () => void } {
  let pending: (() => void) | null = null;
  let raf: number | null = null;
  return {
    schedule(fn: () => void) {
      pending = fn;
      if (raf !== null) return;
      raf = requestAnimationFrame(() => {
        const p = pending;
        pending = null;
        raf = null;
        if (p) p();
      });
    },
    flush() {
      if (raf !== null) cancelAnimationFrame(raf);
      const p = pending;
      pending = null;
      raf = null;
      if (p) p();
    },
    dispose() {
      if (raf !== null) cancelAnimationFrame(raf);
      pending = null;
      raf = null;
    },
  };
}

export interface DirtyRect { x: number; y: number; w: number; h: number }

export class DirtyTracker {
  private rect: DirtyRect | null = null;
  expand(r: DirtyRect): void {
    if (!this.rect) { this.rect = { ...r }; return; }
    const x = Math.min(this.rect.x, r.x);
    const y = Math.min(this.rect.y, r.y);
    const x2 = Math.max(this.rect.x + this.rect.w, r.x + r.w);
    const y2 = Math.max(this.rect.y + this.rect.h, r.y + r.h);
    this.rect = { x, y, w: x2 - x, h: y2 - y };
  }
  take(): DirtyRect | null {
    const r = this.rect;
    this.rect = null;
    return r;
  }
  markAll(): void {
    this.rect = { x: -Infinity, y: -Infinity, w: Infinity, h: Infinity };
  }
}

export const targetFps = (): number => {
  const p = deviceProfile();
  if (p.tier === 'low' || p.prefersReducedMotion) return 30;
  return 60;
};
