'use client';

import { ImageFilterTool } from '@/components/tool/ImageFilterTool';
import { transforms } from '@/engines/image';

export default function PixelateTool() {
  return (
    <ImageFilterTool
      toolId="image-pixelate"
      op="pixelate"
      params={(opts) => ({ size: Number(opts.size) })}
      controls={[
        { id: 'size', label: 'Block size', type: 'slider', defaultValue: 10, min: 2, max: 128, unit: 'px' },
      ]}
      filenameSuffix="-pixelated"
    />
  );
}
