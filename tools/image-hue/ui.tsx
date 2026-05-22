'use client';

import { ImageFilterTool } from '@/components/tool/ImageFilterTool';
import { filters } from '@/engines/image';

export default function HueTool() {
  return (
    <ImageFilterTool
      toolId="image-hue"
      op="hue"
      params={(opts) => ({ angle: Number(opts.angle) })}
      controls={[
        { id: 'angle', label: 'Hue rotation', type: 'slider', defaultValue: 0, min: -180, max: 180, unit: '°' },
      ]}
      filenameSuffix="-hue"
    />
  );
}
