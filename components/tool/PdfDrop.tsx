'use client';
import * as React from 'react';
import { Upload, X, FileText } from 'lucide-react';
import { useStagedInput } from '@/lib/ai/handoff';
import { checkFreeSize } from '@/lib/usage/size-gate';

export interface PdfFileItem {
  file: File;
  buffer: ArrayBuffer;
}

interface SingleProps {
  multiple?: false;
  onLoad: (item: PdfFileItem) => void;
  loaded: boolean;
  fileName?: string;
  onClear?: () => void;
}

interface MultiProps {
  multiple: true;
  items: PdfFileItem[];
  onItemsChange: (items: PdfFileItem[]) => void;
}

type Props = SingleProps | MultiProps;

async function loadFile(file: File): Promise<PdfFileItem> {
  return { file, buffer: await file.arrayBuffer() };
}

export function PdfDrop(props: Props) {
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const [dragActive, setDragActive] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const handle = async (files: FileList | File[]) => {
    setError('');
    setBusy(true);
    try {
      const list = Array.from(files).filter(
        (f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'),
      );
      if (!list.length) {
        setError('Drop a PDF file.');
        return;
      }
      // Free size gate — block on the largest PDF, show the upgrade prompt.
      // Iterate; Math.max(...arr) on a huge arr (folder-drop) overflows V8's
      // argument-count stack.
      let pdfMax = 0;
      for (const f of list) if (f.size > pdfMax) pdfMax = f.size;
      if (!(await checkFreeSize('pdf', pdfMax))) return;
      const items = await Promise.all(list.map(loadFile));
      if (props.multiple) {
        props.onItemsChange([...props.items, ...items]);
      } else {
        props.onLoad(items[0]);
      }
    } catch (e) {
      setError((e as Error).message || 'Could not read this PDF.');
    } finally {
      setBusy(false);
    }
  };

  // Pick up a file the AI staged before navigating here.
  useStagedInput((f) => { void handle([f]); });

  // Keep the latest handler in a ref so the window 'paste' listener (bound
  // once) always sees current props without re-subscribing on every render.
  const handleRef = React.useRef(handle);
  handleRef.current = handle;

  // Clipboard paste — paste a PDF copied from Finder/Explorer/another app and
  // it loads just like a drop. Ignored while the user is typing in a field so
  // it never hijacks a normal Ctrl+V into an input. Lifts every PDF tool.
  React.useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t) {
        const tag = t.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || t.isContentEditable) return;
      }
      const dt = e.clipboardData;
      if (!dt) return;
      const files: File[] = [];
      for (const it of Array.from(dt.items)) {
        if (it.kind === 'file') {
          const f = it.getAsFile();
          if (f) files.push(f);
        }
      }
      const pdfs = files.filter(
        (f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'),
      );
      if (pdfs.length) {
        e.preventDefault();
        void handleRef.current(pdfs);
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, []);

  // Shared drag handlers — track hover so the zone lights up while a file is
  // dragged over it (clearer "drop here" affordance than a static border).
  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); if (!dragActive) setDragActive(true); };
  const onDragLeave = (e: React.DragEvent) => {
    // Only clear when the pointer actually leaves the zone, not when moving
    // over a child element (relatedTarget still inside).
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    setDragActive(false);
  };

  if (props.multiple) {
    return (
      <div className="space-y-2">
        <div
          onDrop={(e) => { e.preventDefault(); setDragActive(false); if (e.dataTransfer.files) void handle(e.dataTransfer.files); }}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          className={`border border-dashed p-5 transition-colors ${dragActive ? 'border-[var(--color-cat-pdf)] bg-[var(--color-cat-pdf)]/[0.06]' : 'border-black/[0.15] bg-[var(--color-surface-1)]'}`}
        >
          <button type="button" onClick={() => inputRef.current?.click()} disabled={busy}
            className="flex w-full flex-col items-center gap-2 text-center">
            <Upload className={`h-6 w-6 ${dragActive ? 'text-[var(--color-cat-pdf)]' : 'text-[var(--color-fg-muted)]'}`} />
            <div className="text-[13px] font-semibold">{busy ? 'Loading…' : dragActive ? 'Drop to add' : 'Drop PDFs or click to add'}</div>
            <div className="text-[10px] text-[var(--color-fg-muted)]">or paste · PDF</div>
          </button>
          <input ref={inputRef} type="file" accept="application/pdf" multiple className="hidden"
            onChange={(e) => { if (e.target.files) void handle(e.target.files); e.target.value = ''; }} />
        </div>

        {props.items.length > 0 && (
          <ul className="space-y-1">
            {props.items.map((it, i) => (
              <li key={i} className="flex items-center gap-2 border border-black/[0.08] bg-[var(--color-surface-1)] px-3 py-2">
                <FileText className="h-4 w-4 text-[var(--color-cat-pdf)] shrink-0" />
                <span className="flex-1 text-[12px] truncate">{it.file.name}</span>
                <span className="font-mono text-[10px] text-[var(--color-fg-muted)]">{(it.file.size / 1024).toFixed(0)} KB</span>
                <div className="flex">
                  <button type="button" disabled={i === 0}
                    onClick={() => {
                      const next = [...props.items];
                      [next[i - 1], next[i]] = [next[i], next[i - 1]];
                      props.onItemsChange(next);
                    }}
                    className="px-1 text-[10px] text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] disabled:opacity-30">↑</button>
                  <button type="button" disabled={i === props.items.length - 1}
                    onClick={() => {
                      const next = [...props.items];
                      [next[i], next[i + 1]] = [next[i + 1], next[i]];
                      props.onItemsChange(next);
                    }}
                    className="px-1 text-[10px] text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] disabled:opacity-30">↓</button>
                </div>
                <button type="button"
                  onClick={() => props.onItemsChange(props.items.filter((_, j) => j !== i))}
                  className="text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]">
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
        {error && <div className="text-[12px] text-red-600">{error}</div>}
      </div>
    );
  }

  return (
    <div
      onDrop={(e) => { e.preventDefault(); setDragActive(false); if (e.dataTransfer.files?.[0]) void handle(e.dataTransfer.files); }}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      className={`border border-dashed p-6 transition-colors ${dragActive ? 'border-[var(--color-cat-pdf)] bg-[var(--color-cat-pdf)]/[0.06]' : 'border-black/[0.15] bg-[var(--color-surface-1)]'}`}
    >
      <button type="button" onClick={() => inputRef.current?.click()} disabled={busy}
        className="flex w-full flex-col items-center gap-3 text-center">
        <Upload className={`h-7 w-7 ${dragActive ? 'text-[var(--color-cat-pdf)]' : 'text-[var(--color-fg-muted)]'}`} />
        <div className="text-[14px] font-semibold">
          {props.loaded && props.fileName ? props.fileName : busy ? 'Loading…' : dragActive ? 'Drop to load' : 'Drop a PDF file'}
        </div>
        <div className="text-[11px] text-[var(--color-fg-muted)]">Drop, click, or paste · PDF</div>
      </button>
      <input ref={inputRef} type="file" accept="application/pdf" className="hidden"
        onChange={(e) => { if (e.target.files) void handle(e.target.files); e.target.value = ''; }} />
      {error && <div className="mt-3 text-[12px] text-red-600">{error}</div>}
    </div>
  );
}
