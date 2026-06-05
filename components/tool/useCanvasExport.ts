'use client';
import * as React from 'react';

/**
 * Shared live-preview + export plumbing for the GENERATOR-style image tools
 * (social banner, OG image, and anything that paints a full-size <canvas> from
 * text/style controls). These tools all had the same three rough edges:
 *
 *   1. Every keystroke re-rendered the FULL export-resolution canvas (up to
 *      2560×1440) and ran toBlob synchronously → visible jank while typing. We
 *      debounce the heavy encode so dragging a slider / typing stays smooth, and
 *      still settle on the final frame quickly.
 *   2. The preview blob URL had to be hand-managed for leaks in every tool. The
 *      hook owns the URL lifecycle (revokes the previous one, and the last one
 *      on unmount) so callers can't leak it.
 *   3. No feedback on the exported file. The hook tracks the output byte size so
 *      the tool can show "name.png · 248 KB" after download — the small detail
 *      best-in-class generators (e.g. Vercel OG, Pablo) always show.
 *
 * The hook is render-agnostic: the caller passes a `paint(canvas)` closure and a
 * deps array; the hook produces `{ url, bytes, busy, download }`.
 */
export interface CanvasExportOptions {
  /** Output pixel size. */
  width: number;
  height: number;
  /** Paint the frame. Called with a fresh canvas sized to width×height. */
  paint: (canvas: HTMLCanvasElement) => void;
  /** Re-render when any of these change (like a useEffect dep array). */
  deps: React.DependencyList;
  /** MIME for the export. Default image/png. */
  type?: string;
  /** Quality for lossy types (0..1). */
  quality?: number;
  /** Debounce in ms before the heavy encode runs. Default 120. */
  debounceMs?: number;
}

export interface CanvasExportState {
  /** Object URL of the current preview frame (or '' before first render). */
  url: string;
  /** Byte size of the current preview blob (0 before first render). */
  bytes: number;
  /** True while a (debounced) render is pending. */
  busy: boolean;
  /** Trigger a download of the current frame with the given filename. */
  download: (filename: string) => void;
}

export function useCanvasExport(opts: CanvasExportOptions): CanvasExportState {
  const { width, height, paint, type = 'image/png', quality, debounceMs = 120 } = opts;
  const [url, setUrl] = React.useState('');
  const [bytes, setBytes] = React.useState(0);
  const [busy, setBusy] = React.useState(false);

  // Mirror the latest URL so the unmount cleanup revokes the LAST one.
  const urlRef = React.useRef('');
  React.useEffect(() => { urlRef.current = url; }, [url]);
  React.useEffect(() => () => { if (urlRef.current) URL.revokeObjectURL(urlRef.current); }, []);

  // Keep paint in a ref so the debounce effect can depend ONLY on the caller's
  // deps (paint is typically a fresh closure each render).
  const paintRef = React.useRef(paint);
  React.useEffect(() => { paintRef.current = paint; });

  React.useEffect(() => {
    setBusy(true);
    let cancelled = false;
    const t = window.setTimeout(() => {
      const c = document.createElement('canvas');
      c.width = width; c.height = height;
      try {
        paintRef.current(c);
      } catch {
        setBusy(false);
        return;
      }
      c.toBlob((blob) => {
        if (cancelled || !blob) { setBusy(false); return; }
        if (urlRef.current) URL.revokeObjectURL(urlRef.current);
        const next = URL.createObjectURL(blob);
        urlRef.current = next;
        setUrl(next);
        setBytes(blob.size);
        setBusy(false);
      }, type, quality);
    }, debounceMs);
    return () => { cancelled = true; window.clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, height, type, quality, debounceMs, ...opts.deps]);

  const download = React.useCallback((filename: string) => {
    if (!urlRef.current) return;
    const a = document.createElement('a');
    a.href = urlRef.current;
    a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  }, []);

  return { url, bytes, busy, download };
}

export function fmtBytes(n: number): string {
  if (n <= 0) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}
