'use client';
import * as React from 'react';
import { Play, Pause } from 'lucide-react';

interface Props {
  buffer: AudioBuffer;
  width?: number;
  height?: number;
  color?: string;
  selection?: { start: number; end: number } | null;
  /**
   * When set, the waveform becomes interactive: click or drag across it to set
   * a [start,end] selection. A bare click (no drag) collapses to a single
   * point — tools can treat that as "seek". Omit to keep the static render
   * used by the many read-only callers.
   */
  onSelectionChange?: (sel: { start: number; end: number }) => void;
  /**
   * Show a built-in play/pause transport with a live playhead so users can
   * actually hear the audio (and, with a selection, audition just that part).
   * Defaults to off so existing static callers are unchanged.
   */
  player?: boolean;
}

function resolveColor(color: string): string {
  return color.startsWith('var(')
    ? getComputedStyle(document.documentElement).getPropertyValue(color.slice(4, -1)).trim() || '#888'
    : color;
}

export function Waveform({
  buffer,
  width = 800,
  height = 96,
  color = 'var(--color-cat-audio)',
  selection,
  onSelectionChange,
  player = false,
}: Props) {
  const ref = React.useRef<HTMLCanvasElement>(null);
  const wrapRef = React.useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = React.useState(false);
  const [playhead, setPlayhead] = React.useState(0); // seconds
  const ctxRef = React.useRef<AudioContext | null>(null);
  const srcRef = React.useRef<AudioBufferSourceNode | null>(null);
  const rafRef = React.useRef<number | null>(null);
  const startInfo = React.useRef<{ ctxTime: number; offset: number }>({ ctxTime: 0, offset: 0 });

  // --- draw the waveform (+ selection mask + playhead) ---
  React.useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    const data = buffer.getChannelData(0);
    const samplesPerPixel = Math.max(1, Math.floor(data.length / width));
    const mid = height / 2;
    const resolved = resolveColor(color);
    ctx.fillStyle = resolved;

    for (let x = 0; x < width; x++) {
      let min = 1, max = -1;
      for (let i = 0; i < samplesPerPixel; i++) {
        const v = data[x * samplesPerPixel + i];
        if (v < min) min = v;
        if (v > max) max = v;
      }
      const y1 = mid + min * mid;
      const y2 = mid + max * mid;
      ctx.fillRect(x, y1, 1, Math.max(1, y2 - y1));
    }

    if (selection) {
      const s = (selection.start / buffer.duration) * width;
      const e = (selection.end / buffer.duration) * width;
      ctx.fillStyle = 'rgba(0,0,0,0.15)';
      ctx.fillRect(0, 0, s, height);
      ctx.fillRect(e, 0, width - e, height);
      ctx.strokeStyle = resolved;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(s + 1, 0); ctx.lineTo(s + 1, height);
      ctx.moveTo(e - 1, 0); ctx.lineTo(e - 1, height);
      ctx.stroke();
    }

    if (player && playhead > 0) {
      const px = (playhead / buffer.duration) * width;
      ctx.strokeStyle = resolved;
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      ctx.moveTo(px, 0); ctx.lineTo(px, height);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }, [buffer, width, height, color, selection, player, playhead]);

  // --- playback ---
  const stop = React.useCallback(() => {
    if (rafRef.current != null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    const src = srcRef.current;
    if (src) { try { src.onended = null; src.stop(); } catch { /* already stopped */ } srcRef.current = null; }
    setPlaying(false);
  }, []);

  // Stop + free the AudioContext when the buffer changes or component unmounts.
  React.useEffect(() => {
    return () => {
      stop();
      const c = ctxRef.current;
      if (c && c.state !== 'closed') { void c.close(); }
      ctxRef.current = null;
    };
  }, [buffer, stop]);

  const tick = React.useCallback(() => {
    const c = ctxRef.current;
    if (!c) return;
    const pos = startInfo.current.offset + (c.currentTime - startInfo.current.ctxTime);
    const end = selection ? selection.end : buffer.duration;
    if (pos >= end) { setPlayhead(selection ? selection.start : 0); stop(); return; }
    setPlayhead(pos);
    rafRef.current = requestAnimationFrame(tick);
  }, [buffer.duration, selection, stop]);

  const play = React.useCallback(() => {
    let c = ctxRef.current;
    if (!c || c.state === 'closed') {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      c = new Ctx();
      ctxRef.current = c;
    }
    void c.resume();
    const src = c.createBufferSource();
    src.buffer = buffer;
    src.connect(c.destination);
    // Start at the playhead, but only within the active selection if any.
    const lo = selection ? selection.start : 0;
    const hi = selection ? selection.end : buffer.duration;
    let from = playhead;
    if (from < lo || from >= hi) from = lo;
    src.onended = () => { if (srcRef.current === src) stop(); };
    src.start(0, from, hi - from);
    srcRef.current = src;
    startInfo.current = { ctxTime: c.currentTime, offset: from };
    setPlaying(true);
    rafRef.current = requestAnimationFrame(tick);
  }, [buffer, playhead, selection, stop, tick]);

  const toggle = () => { if (playing) stop(); else play(); };

  // --- interactive selection / seek ---
  const posFromEvent = (clientX: number): number => {
    const el = wrapRef.current;
    if (!el) return 0;
    const r = el.getBoundingClientRect();
    const frac = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    return frac * buffer.duration;
  };

  const dragAnchor = React.useRef<number | null>(null);
  const onPointerDown = (e: React.PointerEvent) => {
    if (!onSelectionChange) return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const t = posFromEvent(e.clientX);
    dragAnchor.current = t;
    setPlayhead(t);
    onSelectionChange({ start: t, end: t });
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!onSelectionChange || dragAnchor.current == null) return;
    const t = posFromEvent(e.clientX);
    const a = dragAnchor.current;
    onSelectionChange({ start: Math.min(a, t), end: Math.max(a, t) });
  };
  const onPointerUp = () => { dragAnchor.current = null; };

  const interactive = !!onSelectionChange;

  const canvas = (
    <canvas
      ref={ref}
      style={{ width: '100%', height, display: 'block', cursor: interactive ? 'text' : 'default' }}
      className="border border-black/[0.08] bg-[var(--color-canvas)]"
    />
  );

  if (!player && !interactive) return canvas;

  return (
    <div className="space-y-2">
      <div
        ref={wrapRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        style={{ touchAction: interactive ? 'none' : undefined }}
      >
        {canvas}
      </div>
      {player && (
        <div className="flex items-center gap-3">
          <button type="button" onClick={toggle}
            aria-label={playing ? 'Pause' : 'Play'}
            className="flex h-8 w-8 shrink-0 items-center justify-center bg-[var(--color-cat-audio)] text-white transition hover:brightness-110">
            {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </button>
          <span className="font-mono text-[11px] tabular-nums text-[var(--color-fg-muted)]">
            {playhead.toFixed(1)}s / {buffer.duration.toFixed(1)}s
          </span>
          {selection && (
            <span className="font-mono text-[11px] tabular-nums text-[var(--color-fg-subtle)]">
              · sel {(selection.end - selection.start).toFixed(1)}s
            </span>
          )}
        </div>
      )}
    </div>
  );
}
