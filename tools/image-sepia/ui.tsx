'use client';

import { ImageFilterTool } from '@/components/tool/ImageFilterTool';
import { filters } from '@/engines/image';

export default function SepiaTool() {
  return (
    <ImageFilterTool
      toolId="image-sepia"
      op="sepia"
      params={(opts) => ({ amount: Number(opts.amount) })}
      controls={[
        { id: 'amount', label: 'Strength', type: 'slider', defaultValue: 100, min: 0, max: 100, unit: '%' },
      ]}
      filenameSuffix="-sepia"
    />
  );
}
