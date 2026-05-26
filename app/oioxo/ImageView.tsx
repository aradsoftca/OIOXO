'use client';
/**
 * oioxo Code — IMAGE viewer. Shows an image (a blob/object URL or data URI) on a
 * checkerboard so transparency reads, instead of dumping bytes into the editor.
 */
import * as React from 'react';

const CHECKER =
  'repeating-conic-gradient(#e4e4e7 0% 25%, #fafafa 0% 50%) 50% / 16px 16px';

export default function ImageView({ src, name }: { src: string; name?: string }) {
  return (
    <div className="grid h-full place-items-center overflow-auto p-4" style={{ background: CHECKER }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={name ?? 'image'} className="max-h-full max-w-full object-contain shadow-sm" />
    </div>
  );
}
