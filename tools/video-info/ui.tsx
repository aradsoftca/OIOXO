'use client';
import * as React from 'react';
import { VideoDrop, type VideoFileItem } from '@/components/tool/VideoDrop';
import { fmtDuration } from '@/engines/video';

function Row({ label, value }: { label: string; value: string | number }) {
  if (value === '' || value === null || value === undefined) return null;
  return (
    <div className="flex items-baseline justify-between border-b border-black/[0.06] py-2">
      <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">{label}</span>
      <span className="font-mono text-[12px] tabular-nums text-right max-w-[70%] truncate">{String(value)}</span>
    </div>
  );
}

export default function Tool() {
  const [item, setItem] = React.useState<VideoFileItem | null>(null);

  React.useEffect(() => {
    return () => { if (item?.url) URL.revokeObjectURL(item.url); };
  }, [item]);

  const orientation = item && item.info.width > item.info.height
    ? 'Landscape'
    : item && item.info.height > item.info.width
    ? 'Portrait'
    : 'Square';

  return (
    <div className="space-y-4">
      {!item && <VideoDrop loaded={false} onLoad={setItem} />}

      {item && (
        <>
          <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-3 flex flex-wrap items-center gap-3">
            <span className="text-[12px] font-semibold">{item.file.name}</span>
            <button type="button" onClick={() => setItem(null)}
              className="ml-auto text-[10px] font-bold uppercase tracking-wider text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]">Change file</button>
          </div>

          <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
            <div className="border border-black/[0.08] bg-black aspect-video flex items-center justify-center">
              {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
              <video src={item.url} controls className="max-h-full max-w-full" />
            </div>

            <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4">
              <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)] mb-2">Properties</div>
              <Row label="Duration" value={fmtDuration(item.info.duration)} />
              <Row label="Width" value={`${item.info.width} px`} />
              <Row label="Height" value={`${item.info.height} px`} />
              <Row label="Aspect ratio" value={item.info.aspectRatio} />
              <Row label="Orientation" value={orientation} />
              <Row label="Has audio" value={item.info.hasAudio ? 'Yes' : 'No'} />
              <Row label="File size" value={`${(item.info.fileSize / 1024 / 1024).toFixed(2)} MB`} />
              <Row label="MIME type" value={item.info.mimeType} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
