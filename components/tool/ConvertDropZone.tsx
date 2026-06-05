'use client';

import * as React from 'react';
import { Upload } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useStagedInput } from '@/lib/ai/handoff';

interface Props {
  /** Called with the dropped/picked/pasted file(s). Single-file tools read [0]. */
  onFiles: (files: File[]) => void;
  /** Accept attribute for the native picker (e.g. ".docx,.odt"). */
  accept?: string;
  /** Allow selecting / dropping more than one file. */
  multiple?: boolean;
  /** Primary call-to-action line. */
  label: string;
  /** Secondary line — supported formats, limits, etc. */
  sublabel?: React.ReactNode;
  /** Disable interaction while a load is in flight. */
  busy?: boolean;
  /** Compact padding for the "already-loaded, add more" case. */
  compact?: boolean;
  /** Brand color var, defaults to the convert category. */
  colorVar?: string;
  className?: string;
}

/**
 * Shared drop surface for the convert-category tools. One component lifts the
 * whole category to a best-in-class intake flow:
 *  - drag-and-drop with a clear, full-zone HOVER state (was: no feedback)
 *  - paste from clipboard — Ctrl/Cmd+V a copied file or a screenshot anywhere
 *    on the page drops it straight into the converter (ignored while the user
 *    is typing in a field)
 *  - click / keyboard (Enter or Space) to open the native picker
 *  - AI hand-off: a file staged by the assistant auto-loads on mount
 *
 * Visual language matches FontDrop/AudioDrop so it slots into every tool with
 * zero restyling. Filtering/validation stays in each tool's load() handler.
 */
export function ConvertDropZone({
  onFiles,
  accept,
  multiple = false,
  label,
  sublabel,
  busy = false,
  compact = false,
  colorVar = '--color-cat-convert',
  className,
}: Props) {
  const [dragging, setDragging] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);
  // Depth counter so nested children entering/leaving don't flicker the state.
  const depth = React.useRef(0);

  // Keep the latest callback without re-binding the global paste listener.
  const onFilesRef = React.useRef(onFiles);
  onFilesRef.current = onFiles;

  const emit = React.useCallback((list: FileList | File[] | null | undefined) => {
    if (!list) return;
    const files = Array.from(list);
    if (!files.length) return;
    onFilesRef.current(multiple ? files : [files[0]]);
  }, [multiple]);

  // Pick up a file the AI staged before navigating here.
  useStagedInput((f) => emit([f]));

  // Paste-anywhere: Ctrl/Cmd+V a copied file or screenshot lands in the tool.
  // Skip when the user is typing into a field so paste-into-input still works.
  React.useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t) {
        const tag = t.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable) return;
      }
      const items = e.clipboardData?.files;
      if (items && items.length) {
        e.preventDefault();
        emit(items);
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [emit]);

  return (
    <div
      onDragEnter={(e) => { e.preventDefault(); depth.current += 1; setDragging(true); }}
      onDragOver={(e) => { e.preventDefault(); if (!dragging) setDragging(true); }}
      onDragLeave={(e) => { e.preventDefault(); depth.current = Math.max(0, depth.current - 1); if (depth.current === 0) setDragging(false); }}
      onDrop={(e) => {
        e.preventDefault();
        depth.current = 0;
        setDragging(false);
        emit(e.dataTransfer.files);
      }}
      className={cn(
        'border border-dashed transition-colors',
        dragging
          ? 'border-[var(--dz)] bg-[color:var(--dz)]/[0.07] ring-1 ring-[var(--dz)]'
          : 'border-black/[0.18] bg-[var(--color-surface-1)] hover:border-[var(--dz)]/60',
        compact ? 'p-5' : 'flex aspect-[5/2] items-center justify-center',
        className,
      )}
      style={{ ['--dz' as string]: `var(${colorVar})` }}
    >
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className={cn(
          'flex items-center gap-3 text-[13px] text-[var(--color-fg-muted)] disabled:opacity-60',
          compact ? 'w-full justify-center' : 'flex-col text-center',
        )}
      >
        <Upload className={cn('shrink-0', compact ? 'h-4 w-4' : 'h-5 w-5', dragging && 'text-[var(--dz)]')} />
        <span className="flex flex-col items-center gap-1">
          <span className={cn('font-medium', dragging && 'text-[var(--color-fg)]')}>
            {dragging ? 'Drop to load' : busy ? 'Loading…' : label}
          </span>
          {sublabel && !dragging && (
            <span className="text-[11px] text-[var(--color-fg-subtle)]">{sublabel}</span>
          )}
        </span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        className="hidden"
        onChange={(e) => {
          emit(e.target.files);
          // Reset so re-picking the same file fires onChange again.
          e.target.value = '';
        }}
      />
    </div>
  );
}
