'use client';

import { ImageFilterTool } from '@/components/tool/ImageFilterTool';
import { filters } from '@/engines/image';

export default function SaturationTool() {
  return (
    <ImageFilterTool
      toolId="image-saturation"
      op="saturation"
      params={(opts) => ({ value: Number(opts.value) })}
      controls={[
        { id: 'value', label: 'Saturation', type: 'slider', defaultValue: 0, min: -100, max: 100 },
      ]}
      filenameSuffix="-saturation"
    />
  );
}
