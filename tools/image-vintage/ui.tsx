'use client';

import { ImageFilterTool } from '@/components/tool/ImageFilterTool';
import { filters } from '@/engines/image';

export default function VintageTool() {
  return (
    <ImageFilterTool
      toolId="image-vintage"
      op="vintage"
      params={(opts) => ({ amount: Number(opts.amount) })}
      controls={[
        { id: 'amount', label: 'Intensity', type: 'slider', defaultValue: 80, min: 0, max: 100, unit: '%' },
      ]}
      filenameSuffix="-vintage"
    />
  );
}
