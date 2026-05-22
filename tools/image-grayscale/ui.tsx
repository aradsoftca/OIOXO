'use client';

import { ImageFilterTool } from '@/components/tool/ImageFilterTool';
import { filters } from '@/engines/image';

export default function GrayscaleTool() {
  return (
    <ImageFilterTool
      toolId="image-grayscale"
      op="grayscale"
      params={(opts) => ({ amount: Number(opts.amount) })}
      controls={[
        { id: 'amount', label: 'Amount', type: 'slider', defaultValue: 100, min: 0, max: 100, unit: '%' },
      ]}
      filenameSuffix="-grayscale"
    />
  );
}
