'use client';

import { ImageFilterTool } from '@/components/tool/ImageFilterTool';

/**
 * Image Blur — thin wrapper over the shared ImageFilterTool engine.
 *
 * The engine decodes once, previews against a downscaled copy off the main
 * thread (no per-edit re-decode, no full-res paint), and only renders + encodes
 * at full resolution on download. The blur itself is a GPU canvas-filter op.
 */
export default function ImageBlurTool() {
  return (
    <ImageFilterTool
      toolId="image-blur"
      op="blur"
      params={(o) => ({ blurPx: Number(o.blurPx) })}
      controls={[
        { id: 'blurPx', label: 'Blur strength', type: 'slider', defaultValue: 8, min: 0, max: 64, unit: 'px' },
      ]}
      defaultFormat="jpeg"
      filenameSuffix="-blur"
    />
  );
}
