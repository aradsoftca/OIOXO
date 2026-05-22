'use client';

import { ImageFilterTool } from '@/components/tool/ImageFilterTool';
import { transforms } from '@/engines/image';

export default function BorderTool() {
  return (
    <ImageFilterTool
      toolId="image-border"
      op="border"
      params={(opts) => ({ width: Number(opts.width), color: String(opts.color) })}
      controls={[
        { id: 'width', label: 'Width', type: 'slider', defaultValue: 24, min: 0, max: 200, unit: 'px' },
        { id: 'color', label: 'Color', type: 'color', defaultValue: '#ffffff' },
      ]}
      compare={false}
      filenameSuffix="-bordered"
    />
  );
}
