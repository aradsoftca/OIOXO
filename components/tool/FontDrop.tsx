'use client';
import * as React from 'react';
import { Upload } from 'lucide-react';
import type { Font } from 'opentype.js';
import { loadFont } from '@/engines/font';
import { useStagedInput } from '@/lib/ai/handoff';
import { checkFreeSize } from '@/lib/usage/size-gate';

interface Props {
  onLoad: (font: Font, file: File, buffer: ArrayBuffer) => void;
  loaded: boolean;
  fileName?: string;
}

// opentype.js parses TTF/OTF/WOFF; WOFF2 needs an external decoder it doesn't ship.
const FONT_EXT = /\.(ttf|otf|woff2?|ttc|dfont)$/i;

function looksLikeFont(file: File): boolean {
  if (file.type.startsWith('font/')) return true;
  if (file.type === 'application/x-font-ttf' || file.type === 'application/font-woff') return true;
  return FONT_EXT.test(file.name);
}

/** Don't hijack a paste while the user is typing in a field. */
function isEditableTarget(el: EventTarget | null): boolean {
  const node = el as HTMLElement | null;
  if (!node) return false;
  const tag = node.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || node.isContentEditable;
}

export function FontDrop({ onLoad, loaded, fileName }: Props) {
  const [error, setError] = React.useState<string>('');
  const [busy, setBusy] = React.useState(false);
  const [dragging, setDragging] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const dragDepth = React.useRef(0);

  const handleFile = React.useCallback(async (file: File) => {
    setError('');
    if (!looksLikeFont(file)) {
      setError('That doesn’t look like a font file. Use TTF, OTF or WOFF.');
      return;
    }
    if (!(await checkFreeSize('font', file.size))) return; // free size gate
    setBusy(true);
    try {
      const buf = await file.arrayBuffer();
      const font = await loadFont(buf);
      onLoad(font, file, buf);
    } catch (e) {
      // opentype throws a terse message for WOFF2 / corrupt files — make it human.
      const raw = (e as Error).message || '';
      setError(
        /woff2|brotli/i.test(raw)
          ? 'WOFF2 isn’t supported here yet — convert it to TTF/OTF/WOFF first.'
          : raw || 'Could not read this font file.',
      );
    } finally {
      setBusy(false);
    }
  }, [onLoad]);

  // Pick up a file the AI staged before navigating here.
  useStagedInput((f) => { void handleFile(f); });

  // Paste a font file from the clipboard (e.g. copied in the OS file manager),
  // anywhere on the page — but never while typing in a field. Lifts every tool.
  React.useEffect(() => {
    if (loaded) return;
    const onPaste = (e: ClipboardEvent) => {
      if (isEditableTarget(e.target) || isEditableTarget(document.activeElement)) return;
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const it of items) {
        if (it.kind === 'file') {
          const f = it.getAsFile();
          if (f) { e.preventDefault(); void handleFile(f); return; }
        }
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [loaded, handleFile]);

  return (
    <div
      onDrop={(e) => {
        e.preventDefault();
        dragDepth.current = 0;
        setDragging(false);
        const f = e.dataTransfer.files?.[0];
        if (f) void handleFile(f);
      }}
      onDragEnter={(e) => {
        e.preventDefault();
        dragDepth.current += 1;
        setDragging(true);
      }}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={(e) => {
        e.preventDefault();
        dragDepth.current -= 1;
        if (dragDepth.current <= 0) { dragDepth.current = 0; setDragging(false); }
      }}
      className={`border border-dashed p-6 transition-colors ${
        dragging
          ? 'border-[var(--color-cat-font)] bg-[var(--color-cat-font)]/[0.06]'
          : 'border-black/[0.15] bg-[var(--color-surface-1)]'
      }`}
    >
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className="flex w-full flex-col items-center gap-3 text-center"
      >
        <Upload className={`h-7 w-7 ${dragging ? 'text-[var(--color-cat-font)]' : 'text-[var(--color-fg-muted)]'}`} />
        <div className="text-[14px] font-semibold text-[var(--color-fg)]">
          {dragging ? 'Drop to load' : loaded && fileName ? fileName : busy ? 'Loading…' : 'Drop a font file'}
        </div>
        <div className="text-[11px] text-[var(--color-fg-muted)]">
          TTF · OTF · WOFF — drop, click or paste
        </div>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept=".ttf,.otf,.woff,.woff2,.ttc,font/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
          // Reset value so re-picking the same font triggers onChange again.
          e.target.value = '';
        }}
      />
      {error && <div className="mt-3 text-[12px] text-red-600">{error}</div>}
    </div>
  );
}
