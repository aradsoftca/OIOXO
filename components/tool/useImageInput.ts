'use client';
import * as React from 'react';

/**
 * Shared image-input ergonomics for single-purpose image tools (avatar, resize,
 * and any tool that takes ONE image and renders a live result). Three things
 * every best-in-class tool (Squoosh, TinyPNG) does that our per-tool drop zones
 * were missing:
 *
 *   1. CLIPBOARD PASTE — paste a screenshot straight in (Ctrl/Cmd+V). The
 *      listener ignores paste while the user is typing in an input/textarea so
 *      it never hijacks the text fields these tools also have.
 *   2. DRAG-DROP ANYWHERE — drop the file on the whole tool area, not just the
 *      32px upload square, with a `dragging` flag the caller turns into a clear
 *      hover overlay.
 *   3. ESC TO CLEAR — a single key handler (active only once something is
 *      loaded) so the user can reset without hunting for a button.
 *
 * The hook is intentionally headless: it returns the drag handlers + state and
 * leaves all rendering to the tool, so it composes with each tool's existing
 * layout, gates, and watermark flow without changing any of them.
 */
export interface ImageInputOptions {
  /** Called with the first image File from a drop / paste. */
  onFile: (file: File) => void;
  /** When true (default), Esc clears. Pass a no-op `onClear` to disable. */
  onClear?: () => void;
  /** Disable all listeners (e.g. while busy). Default false. */
  disabled?: boolean;
}

export interface ImageInputBindings {
  /** True while a file is being dragged over the window — drive a hover overlay. */
  dragging: boolean;
  /** Spread onto the root element of the tool to capture drops anywhere on it. */
  dropZoneProps: {
    onDragOver: (e: React.DragEvent) => void;
    onDragEnter: (e: React.DragEvent) => void;
    onDragLeave: (e: React.DragEvent) => void;
    onDrop: (e: React.DragEvent) => void;
  };
}

function firstImageFile(list: FileList | null | undefined): File | null {
  if (!list) return null;
  for (const f of Array.from(list)) {
    if (f.type.startsWith('image/')) return f;
  }
  return null;
}

function isTypingTarget(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}

export function useImageInput(opts: ImageInputOptions): ImageInputBindings {
  const { onFile, onClear, disabled = false } = opts;
  const [dragging, setDragging] = React.useState(false);
  const depth = React.useRef(0);

  // Keep the latest callbacks in refs so the window listeners (mounted once)
  // always call the current handlers without re-subscribing every render.
  const onFileRef = React.useRef(onFile);
  const onClearRef = React.useRef(onClear);
  const disabledRef = React.useRef(disabled);
  React.useEffect(() => { onFileRef.current = onFile; }, [onFile]);
  React.useEffect(() => { onClearRef.current = onClear; }, [onClear]);
  React.useEffect(() => { disabledRef.current = disabled; }, [disabled]);

  // Clipboard paste (Ctrl/Cmd+V) anywhere on the page — ignored while typing.
  React.useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (disabledRef.current) return;
      if (isTypingTarget(e.target)) return;
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const it of Array.from(items)) {
        if (it.kind === 'file' && it.type.startsWith('image/')) {
          const f = it.getAsFile();
          if (f) { e.preventDefault(); onFileRef.current(f); return; }
        }
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, []);

  // Esc to clear (only when something is loaded → onClear provided).
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (disabledRef.current) return;
      if (isTypingTarget(e.target)) return;
      onClearRef.current?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const dropZoneProps = React.useMemo(() => ({
    onDragOver: (e: React.DragEvent) => { e.preventDefault(); },
    onDragEnter: (e: React.DragEvent) => {
      e.preventDefault();
      if (disabledRef.current) return;
      depth.current += 1;
      setDragging(true);
    },
    onDragLeave: (e: React.DragEvent) => {
      e.preventDefault();
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) setDragging(false);
    },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      depth.current = 0;
      setDragging(false);
      if (disabledRef.current) return;
      const f = firstImageFile(e.dataTransfer?.files);
      if (f) onFileRef.current(f);
    },
  }), []);

  return { dragging, dropZoneProps };
}
