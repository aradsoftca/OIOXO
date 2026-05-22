'use client';

import { ImageFilterTool } from '@/components/tool/ImageFilterTool';
import { filters } from '@/engines/image';

export default function SharpenTool() {
  return (
    <ImageFilterTool
      toolId="image-sharpen"
      op="sharpen"
      params={(opts) => ({ amount: Number(opts.amount) })}
      controls={[
        { id: 'amount', label: 'Amount', type: 'slider', defaultValue: 50, min: 0, max: 200, unit: '%' },
      ]}
      filenameSuffix="-sharpened"
    />
  );
}
