'use client';

import { ImageFilterTool } from '@/components/tool/ImageFilterTool';
import { transforms } from '@/engines/image';

export default function RoundCornersTool() {
  return (
    <ImageFilterTool
      toolId="image-round-corners"
      op="roundCorners"
      params={(opts) => ({ radius: Number(opts.radius) })}
      controls={[
        { id: 'radius', label: 'Corner radius', type: 'slider', defaultValue: 32, min: 0, max: 256, unit: 'px' },
      ]}
      defaultFormat="png"
      filenameSuffix="-rounded"
    />
  );
}
