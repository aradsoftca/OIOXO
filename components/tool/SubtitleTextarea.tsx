'use client';

import * as React from 'react';
import { FileUp } from 'lucide-react';
import { cn } from '@/lib/cn';

const ACCEPT = '.srt,.vtt,.ass,.ssa,.sub,.txt';

/**
 * A subtitle-aware <textarea> for the few subtitle tools that have a bespoke
 * multi-pane layout (merger, translator-prep) and so can't use TextTool. Adds:
 *   - drag-drop a subtitle file straight onto the box (with a hover ring)
 *   - an "open file" button (top-right) wired to a hidden picker
 *   - reads the file as text and pushes it through the same onChange contract
 * Keeps the existing styling/props of the textarea it replaces. Pure UI, no gates.
 */
export function SubtitleTextarea({
  value,
  onChange,
  placeholder,
  className,
  readOnly,
  label,
  colorVar = '--color-cat-subtitle',
}: {
  value: string;
  onChange?: (v: string) => void;
  placeholder?: string;
  className?: string;
  readOnly?: boolean;
  label?: string;
  colorVar?: string;
}) {
  const [dragging, setDragging] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const depth = React.useRef(0);

  const load = React.useCallback((file: File) => {
    file.text().then((t) => onChange?.(t)).catch(() => { /* not text */ });
  }, [onChange]);

  const hasFiles = (e: React.DragEvent) => Array.from(e.dataTransfer.types).includes('Files');

  return (
    <div className="relative">
      {!readOnly && (
        <>
          <input
            ref={fileRef}
            type="file"
            accept={ACCEPT}
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) load(f); e.target.value = ''; }}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            title="Open subtitle file"
            className="absolute right-2 top-2 z-10 flex h-7 w-7 items-center justify-center bg-[var(--color-surface-1)]/80 text-[var(--color-fg-subtle)] transition hover:text-[var(--color-fg)]"
          >
            <FileUp className="h-3.5 w-3.5" />
          </button>
        </>
      )}
      <textarea
        value={value}
        readOnly={readOnly}
        onChange={onChange ? (e) => onChange(e.target.value) : undefined}
        placeholder={readOnly ? placeholder : `${placeholder ?? ''}${placeholder ? '  ' : ''}— or drop a file`}
        spellCheck={false}
        aria-label={label}
        onDragOver={readOnly ? undefined : (e) => { if (hasFiles(e)) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } }}
        onDragEnter={readOnly ? undefined : (e) => { if (hasFiles(e)) { e.preventDefault(); depth.current += 1; setDragging(true); } }}
        onDragLeave={readOnly ? undefined : (e) => { if (hasFiles(e)) { depth.current = Math.max(0, depth.current - 1); if (depth.current === 0) setDragging(false); } }}
        onDrop={readOnly ? undefined : (e) => { if (hasFiles(e)) { e.preventDefault(); depth.current = 0; setDragging(false); const f = e.dataTransfer.files?.[0]; if (f) load(f); } }}
        className={cn(className, dragging && 'ring-2 ring-inset')}
        style={dragging ? { ['--tw-ring-color' as string]: `var(${colorVar})` } : undefined}
      />
    </div>
  );
}
