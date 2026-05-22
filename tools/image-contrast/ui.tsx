'use client';

import { ImageFilterTool } from '@/components/tool/ImageFilterTool';
import { filters } from '@/engines/image';

export default function ContrastTool() {
  return (
    <ImageFilterTool
      toolId="image-contrast"
      op="contrast"
      params={(opts) => ({ value: Number(opts.value) })}
      controls={[
        { id: 'value', label: 'Contrast', type: 'slider', defaultValue: 0, min: -100, max: 100 },
      ]}
      filenameSuffix="-contrast"
    />
  );
}
