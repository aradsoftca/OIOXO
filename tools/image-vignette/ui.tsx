'use client';

import { ImageFilterTool } from '@/components/tool/ImageFilterTool';
import { transforms } from '@/engines/image';

function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return [0, 0, 0];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

export default function VignetteTool() {
  return (
    <ImageFilterTool
      toolId="image-vignette"
      op="vignette"
      params={(opts) => ({ strength: Number(opts.strength), radius: Number(opts.radius) / 100, color: hexToRgb(String(opts.color)) })}
      controls={[
        { id: 'strength', label: 'Strength', type: 'slider', defaultValue: 70, min: 0, max: 100, unit: '%' },
        { id: 'radius',   label: 'Falloff',  type: 'slider', defaultValue: 75, min: 0, max: 100, unit: '%' },
        { id: 'color',    label: 'Edge color', type: 'color', defaultValue: '#000000' },
      ]}
      filenameSuffix="-vignette"
    />
  );
}
