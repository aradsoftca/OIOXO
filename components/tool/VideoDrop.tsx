'use client';
import * as React from 'react';
import { Upload } from 'lucide-react';
import { getVideoInfo, type VideoInfo } from '@/engines/video';
import { useStagedInput } from '@/lib/ai/handoff';
import { checkFreeSize } from '@/lib/usage/size-gate';
import { warm as warmFfmpeg } from '@/engines/ffmpeg';

export interface VideoFileItem {
  file: File;
  video: HTMLVideoElement;
  url: string;
  info: VideoInfo;
}

interface Props {
  onLoad: (item: VideoFileItem) => void;
  loaded: boolean;
  fileName?: string;
}

function isVideo(f: File): boolean {
  if (f.type.startsWith('video/')) return true;
  return /\.(mp4|webm|mov|mkv|avi|m4v|ogv)$/i.test(f.name);
}

/** Pull the first usable video out of a DataTransfer (drop or paste). */
function firstVideo(files: FileList | File[] | null | undefined): File | null {
  if (!files) return null;
  const list = Array.from(files);
  return list.find(isVideo) ?? list[0] ?? null;
}

export function VideoDrop({ onLoad, loaded, fileName }: Props) {
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const [dragOver, setDragOver] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const handle = React.useCallback(async (file: File) => {
    if (!isVideo(file)) { setError('That is not a video file. Drop or paste an MP4, WebM, MOV or MKV.'); return; }
    if (!(await checkFreeSize('video', file.size))) return; // free size gate → upgrade prompt
    setBusy(true); setError('');
    // Kick off the (one-time) ffmpeg core download in the background while the
    // user picks settings, so the first export starts without the long cold wait.
    warmFfmpeg();
    try {
      const { info, video, url } = await getVideoInfo(file);
      onLoad({ file, video, url, info });
    } catch (e) {
      setError((e as Error).message);
    } finally { setBusy(false); }
  }, [onLoad]);

  // Pick up a file the AI staged before navigating here.
  useStagedInput((f) => { void handle(f); });

  // Clipboard paste — drop a screenshot recording or copied video straight in
  // (Ctrl/Cmd+V). Ignored while a file is loaded or while typing in a field so
  // it never hijacks normal input. Mirrors the drop/file-picker path exactly.
  React.useEffect(() => {
    if (loaded) return;
    const onPaste = (e: ClipboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      const f = firstVideo(e.clipboardData?.files);
      if (f) { e.preventDefault(); void handle(f); }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [loaded, handle]);

  return (
    <div
      onDrop={(e) => {
        e.preventDefault(); setDragOver(false);
        const f = firstVideo(e.dataTransfer.files);
        if (f) void handle(f);
      }}
      onDragOver={(e) => { e.preventDefault(); if (!dragOver) setDragOver(true); }}
      onDragEnter={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={(e) => {
        // Only clear when the cursor actually leaves the zone, not when moving
        // over a child element (dragleave fires on every nested boundary).
        if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
        setDragOver(false);
      }}
      className={`border border-dashed p-6 transition-colors ${
        dragOver
          ? 'border-[var(--color-cat-video)] bg-[var(--color-cat-video)]/[0.06] ring-1 ring-[var(--color-cat-video)]'
          : 'border-black/[0.15] bg-[var(--color-surface-1)] hover:border-black/[0.28]'
      }`}
    >
      <button type="button" onClick={() => inputRef.current?.click()} disabled={busy}
        className="flex w-full flex-col items-center gap-3 text-center">
        <Upload className={`h-7 w-7 transition-colors ${dragOver ? 'text-[var(--color-cat-video)]' : 'text-[var(--color-fg-muted)]'}`} />
        <div className="text-[14px] font-semibold">
          {dragOver ? 'Drop to load' : loaded && fileName ? fileName : busy ? 'Loading…' : 'Drop, paste, or browse for a video'}
        </div>
        <div className="text-[11px] text-[var(--color-fg-muted)]">MP4 · WebM · MOV · MKV — or press Ctrl/⌘+V to paste</div>
      </button>
      <input ref={inputRef} type="file" accept="video/*" className="hidden"
        onChange={(e) => { const f = firstVideo(e.target.files); if (f) void handle(f); e.target.value = ''; }} />
      {error && <div className="mt-3 text-[12px] text-red-600">{error}</div>}
    </div>
  );
}
