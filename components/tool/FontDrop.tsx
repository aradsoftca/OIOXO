'use client';
import * as React from 'react';
import { Upload } from 'lucide-react';
import type { Font } from 'opentype.js';
import { loadFont } from '@/engines/font';
import { useStagedInput } from '@/lib/ai/handoff';

interface Props {
  onLoad: (font: Font, file: File, buffer: ArrayBuffer) => void;
  loaded: boolean;
  fileName?: string;
}

export function FontDrop({ onLoad, loaded, fileName }: Props) {
  const [error, setError] = React.useState<string>('');
  const [busy, setBusy] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    setError('');
    setBusy(true);
    try {
      const buf = await file.arrayBuffer();
      const font = await loadFont(buf);
      onLoad(font, file, buf);
    } catch (e) {
      setError((e as Error).message || 'Could not read this font file.');
    } finally {
      setBusy(false);
    }
  };

  // Pick up a file the AI staged before navigating here.
  useStagedInput((f) => { void handleFile(f); });

  return (
    <div
      onDrop={(e) => {
        e.preventDefault();
        const f = e.dataTransfer.files?.[0];
        if (f) void handleFile(f);
      }}
      onDragOver={(e) => e.preventDefault()}
      className="border border-dashed border-black/[0.15] bg-[var(--color-surface-1)] p-6"
    >
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className="flex w-full flex-col items-center gap-3 text-center"
      >
        <Upload className="h-7 w-7 text-[var(--color-fg-muted)]" />
        <div className="text-[14px] font-semibold text-[var(--color-fg)]">
          {loaded && fileName ? fileName : busy ? 'Loading…' : 'Drop a font file'}
        </div>
        <div className="text-[11px] text-[var(--color-fg-muted)]">TTF · OTF · WOFF</div>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept=".ttf,.otf,.woff,.woff2,font/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
        }}
      />
      {error && <div className="mt-3 text-[12px] text-red-600">{error}</div>}
    </div>
  );
}
