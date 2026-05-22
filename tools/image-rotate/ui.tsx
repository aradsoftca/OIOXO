'use client';

import { ImageFilterTool } from '@/components/tool/ImageFilterTool';
import { transforms } from '@/engines/image';

export default function RotateTool() {
  return (
    <ImageFilterTool
      toolId="image-rotate"
      op="rotate"
      params={(opts) => ({ angle: Number(opts.angle), background: String(opts.background) })}
      controls={[
        { id: 'angle', label: 'Angle', type: 'slider', defaultValue: 0, min: -180, max: 180, unit: '°' },
        { id: 'background', label: 'Edge fill', type: 'color', defaultValue: '#000000' },
      ]}
      compare={false}
      filenameSuffix="-rotated"
    />
  );
}
