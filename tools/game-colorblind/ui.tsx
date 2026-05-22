'use client';
import { ImageFilterTool } from '@/components/tool/ImageFilterTool';

// Daltonization matrices (Brettel/Vienot/Mollon 1997 approximations).
const MATRICES: Record<string, number[]> = {
  protanopia:   [0.567, 0.433, 0.000, 0.558, 0.442, 0.000, 0.000, 0.242, 0.758],
  deuteranopia: [0.625, 0.375, 0.000, 0.700, 0.300, 0.000, 0.000, 0.300, 0.700],
  tritanopia:   [0.950, 0.050, 0.000, 0.000, 0.433, 0.567, 0.000, 0.475, 0.525],
};

function apply(src: ImageData, kind: string): ImageData {
  const m = MATRICES[kind] ?? MATRICES.deuteranopia;
  const out = new ImageData(new Uint8ClampedArray(src.data), src.width, src.height);
  const d = out.data;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i + 1], b = d[i + 2];
    d[i]     = Math.max(0, Math.min(255, m[0] * r + m[1] * g + m[2] * b));
    d[i + 1] = Math.max(0, Math.min(255, m[3] * r + m[4] * g + m[5] * b));
    d[i + 2] = Math.max(0, Math.min(255, m[6] * r + m[7] * g + m[8] * b));
  }
  return out;
}

export default function Tool() {
  return (
    <ImageFilterTool
      toolId="game-colorblind"
      colorVar="--color-cat-game"
      transform={(data, opts) => apply(data, String(opts.kind))}
      controls={[
        {
          id: 'kind', label: 'Vision type', type: 'select', defaultValue: 'deuteranopia',
          options: [
            { value: 'protanopia',   label: 'Protanopia (red-blind, ~1% of men)' },
            { value: 'deuteranopia', label: 'Deuteranopia (green-blind, ~6%)' },
            { value: 'tritanopia',   label: 'Tritanopia (blue-blind, <0.1%)' },
          ],
        },
      ]}
      filenameSuffix="-colorblind"
    />
  );
}
