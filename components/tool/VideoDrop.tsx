'use client';
import * as React from 'react';
import { Upload } from 'lucide-react';
import { getVideoInfo, type VideoInfo } from '@/engines/video';
import { useStagedInput } from '@/lib/ai/handoff';

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

export function VideoDrop({ onLoad, loaded, fileName }: Props) {
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const inputRef = React.useRef<HTMLInputElement>(null);

  const handle = async (file: File) => {
    if (!isVideo(file)) { setError('Drop a video file.'); return; }
    setBusy(true); setError('');
    try {
      const { info, video, url } = await getVideoInfo(file);
      onLoad({ file, video, url, info });
    } catch (e) {
      setError((e as Error).message);
    } finally { setBusy(false); }
  };

  // Pick up a file the AI staged before navigating here.
  useStagedInput((f) => { void handle(f); });

  return (
    <div
      onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) void handle(f); }}
      onDragOver={(e) => e.preventDefault()}
      className="border border-dashed border-black/[0.15] bg-[var(--color-surface-1)] p-6"
    >
      <button type="button" onClick={() => inputRef.current?.click()} disabled={busy}
        className="flex w-full flex-col items-center gap-3 text-center">
        <Upload className="h-7 w-7 text-[var(--color-fg-muted)]" />
        <div className="text-[14px] font-semibold">
          {loaded && fileName ? fileName : busy ? 'Loading…' : 'Drop a video file'}
        </div>
        <div className="text-[11px] text-[var(--color-fg-muted)]">MP4 · WebM · MOV · MKV</div>
      </button>
      <input ref={inputRef} type="file" accept="video/*" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) void handle(f); e.target.value = ''; }} />
      {error && <div className="mt-3 text-[12px] text-red-600">{error}</div>}
    </div>
  );
}
