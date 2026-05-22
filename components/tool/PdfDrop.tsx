'use client';
import * as React from 'react';
import { Upload, X, FileText } from 'lucide-react';
import { useStagedInput } from '@/lib/ai/handoff';

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

  if (props.multiple) {
    return (
      <div className="space-y-2">
        <div
          onDrop={(e) => { e.preventDefault(); if (e.dataTransfer.files) void handle(e.dataTransfer.files); }}
          onDragOver={(e) => e.preventDefault()}
          className="border border-dashed border-black/[0.15] bg-[var(--color-surface-1)] p-5"
        >
          <button type="button" onClick={() => inputRef.current?.click()} disabled={busy}
            className="flex w-full flex-col items-center gap-2 text-center">
            <Upload className="h-6 w-6 text-[var(--color-fg-muted)]" />
            <div className="text-[13px] font-semibold">{busy ? 'Loading…' : 'Drop PDFs or click to add'}</div>
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
      onDrop={(e) => { e.preventDefault(); if (e.dataTransfer.files?.[0]) void handle(e.dataTransfer.files); }}
      onDragOver={(e) => e.preventDefault()}
      className="border border-dashed border-black/[0.15] bg-[var(--color-surface-1)] p-6"
    >
      <button type="button" onClick={() => inputRef.current?.click()} disabled={busy}
        className="flex w-full flex-col items-center gap-3 text-center">
        <Upload className="h-7 w-7 text-[var(--color-fg-muted)]" />
        <div className="text-[14px] font-semibold">
          {props.loaded && props.fileName ? props.fileName : busy ? 'Loading…' : 'Drop a PDF file'}
        </div>
        <div className="text-[11px] text-[var(--color-fg-muted)]">PDF</div>
      </button>
      <input ref={inputRef} type="file" accept="application/pdf" className="hidden"
        onChange={(e) => { if (e.target.files) void handle(e.target.files); e.target.value = ''; }} />
      {error && <div className="mt-3 text-[12px] text-red-600">{error}</div>}
    </div>
  );
}
