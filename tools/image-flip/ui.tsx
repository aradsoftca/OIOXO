'use client';

import { ImageFilterTool } from '@/components/tool/ImageFilterTool';
import { transforms } from '@/engines/image';

export default function FlipTool() {
  return (
    <ImageFilterTool
      toolId="image-flip"
      op="flip"
      params={(opts) => ({ horizontal: Boolean(opts.horizontal), vertical: Boolean(opts.vertical) })}
      controls={[
        { id: 'horizontal', label: 'Flip horizontally', type: 'toggle', defaultValue: true },
        { id: 'vertical',   label: 'Flip vertically',   type: 'toggle', defaultValue: false },
      ]}
      compare={false}
      filenameSuffix="-flipped"
    />
  );
}
