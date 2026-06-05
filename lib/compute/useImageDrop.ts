'use client';

import * as React from 'react';

/**
 * Shared drop-zone behaviour for the image tools.
 *
 * Lifts every image tool to the Squoosh/iLoveIMG bar with three things the
 * per-tool drop zones were all missing:
 *
 *  1. CLIPBOARD PASTE — paste a screenshot (or any copied image) straight into
 *     the tool. A single window-level `paste` listener feeds the SAME handler
 *     as drag-drop, and is ignored while the user is typing in an input so it
 *     never hijacks normal copy/paste in text fields.
 *  2. DRAG HOVER STATE — `dragging` flips true the moment a file is dragged
 *     over the stage and false on leave/drop, so the tool can paint a clear
 *     "drop here" affordance instead of a dead rectangle.
 *  3. KEYBOARD — Esc clears (when something is loaded), so the user can reset
 *     without reaching for the mouse.
 *
 * It is intentionally tiny and additive: tools keep their own `loadFile`,
 * state, gates and watermark — this only wires the missing entry points.
 */

/** True when the active element is a typing surface we must not steal paste from. */
function isTypingTarget(el: EventTarget | null): boolean {
  const node = el as HTMLElement | null;
  if (!node) return false;
  const tag = node.tagName;
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    node.isContentEditable === true
  );
}

/** Pull the first image File out of a clipboard/drag payload. */
function firstImage(items: DataTransferItemList | null | undefined, files: FileList | null | undefined): File | null {
  if (items) {
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (it.kind === 'file' && it.type.startsWith('image/')) {
        const f = it.getAsFile();
        if (f) return f;
      }
    }
  }
  if (files) {
    for (let i = 0; i < files.length; i++) {
      if (files[i].type.startsWith('image/')) return files[i];
    }
  }
  return null;
}

export interface ImageDropOptions {
  /** Called with the dropped/pasted image (single-file tools). */
  onFile?: (file: File) => void;
  /** Called with ALL image files in the payload (batch tools). Takes precedence. */
  onFiles?: (files: File[]) => void;
  /** Optional: Esc clears the current input. */
  onClear?: () => void;
  /** Optional: Enter runs the primary action (download / apply). */
  onRun?: () => void;
  /** Disable the global paste/keyboard listeners (e.g. when a modal is open). */
  enabled?: boolean;
}

export interface ImageDropHandlers {
  /** True while a drag is hovering the stage — paint a hover affordance. */
  dragging: boolean;
  /** Spread onto the drop target: `<div {...dropZone}>`. */
  dropZone: {
    onDrop: (e: React.DragEvent) => void;
    onDragOver: (e: React.DragEvent) => void;
    onDragEnter: (e: React.DragEvent) => void;
    onDragLeave: (e: React.DragEvent) => void;
  };
}

export function useImageDrop({ onFile, onFiles, onClear, onRun, enabled = true }: ImageDropOptions): ImageDropHandlers {
  const [dragging, setDragging] = React.useState(false);
  // Mirror handlers into a ref so the window listeners stay stable and always
  // call the freshest closures without re-binding on every render.
  const cbRef = React.useRef({ onFile, onFiles, onClear, onRun });
  React.useEffect(() => { cbRef.current = { onFile, onFiles, onClear, onRun }; });

  const deliver = React.useCallback((files: File[]) => {
    if (!files.length) return;
    const { onFile: f, onFiles: fs } = cbRef.current;
    if (fs) fs(files);
    else if (f) f(files[0]);
  }, []);

  // Window-level clipboard paste — works anywhere on the page, skipped while
  // typing so it never breaks paste-into-a-textbox.
  React.useEffect(() => {
    if (!enabled) return;
    const onPaste = (e: ClipboardEvent) => {
      if (isTypingTarget(e.target) || isTypingTarget(document.activeElement)) return;
      const dt = e.clipboardData;
      if (!dt) return;
      const imgs: File[] = [];
      for (let i = 0; i < dt.items.length; i++) {
        const it = dt.items[i];
        if (it.kind === 'file' && it.type.startsWith('image/')) {
          const file = it.getAsFile();
          if (file) imgs.push(file);
        }
      }
      if (imgs.length) {
        e.preventDefault();
        deliver(imgs);
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [enabled, deliver]);

  // Esc to clear, Enter to run the primary action. Both skipped while typing
  // so they never interfere with form fields.
  React.useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      if (e.key === 'Escape' && cbRef.current.onClear) {
        cbRef.current.onClear();
      } else if (e.key === 'Enter' && cbRef.current.onRun) {
        e.preventDefault();
        cbRef.current.onRun();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled]);

  const onDrop = React.useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const dt = e.dataTransfer;
    const all: File[] = [];
    if (dt.files) for (let i = 0; i < dt.files.length; i++) {
      if (dt.files[i].type.startsWith('image/')) all.push(dt.files[i]);
    }
    // Fall back to the items API for sources that only expose items.
    if (!all.length) {
      const single = firstImage(dt.items, dt.files);
      if (single) all.push(single);
    }
    deliver(all);
  }, [deliver]);

  const onDragOver = React.useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
  }, []);

  const onDragEnter = React.useCallback((e: React.DragEvent) => {
    e.preventDefault();
    // Only show the hover state for an actual file drag, not text selections.
    if (Array.from(e.dataTransfer?.types ?? []).includes('Files')) setDragging(true);
  }, []);

  const onDragLeave = React.useCallback((e: React.DragEvent) => {
    // currentTarget bounds — ignore leaves into child elements.
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    if (
      e.clientX <= rect.left || e.clientX >= rect.right ||
      e.clientY <= rect.top || e.clientY >= rect.bottom
    ) {
      setDragging(false);
    }
  }, []);

  return {
    dragging,
    dropZone: { onDrop, onDragOver, onDragEnter, onDragLeave },
  };
}
