'use client';

import { ImageFilterTool } from '@/components/tool/ImageFilterTool';
import { filters } from '@/engines/image';

export default function BrightnessTool() {
  return (
    <ImageFilterTool
      toolId="image-brightness"
      op="brightness"
      params={(opts) => ({ value: Number(opts.value) })}
      controls={[
        { id: 'value', label: 'Brightness', type: 'slider', defaultValue: 0, min: -100, max: 100 },
      ]}
      filenameSuffix="-brightness"
    />
  );
}
