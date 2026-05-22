'use client';
import { CalcTool, type CalcResult } from '@/components/tool/CalcTool';

function compute(v: Record<string, string | number>): CalcResult[] {
  const fovIn = Number(v.fov) || 0;
  const direction = String(v.direction);
  const w = Number(v.width) || 16;
  const h = Number(v.height) || 9;
  if (fovIn <= 0 || fovIn >= 180) return [{ label: 'Enter a valid FOV', value: '—', primary: true }];

  const aspect = w / h;
  const radIn = (fovIn * Math.PI) / 180;
  let hFov: number;
  let vFov: number;
  if (direction === 'horizontal') {
    hFov = fovIn;
    vFov = (2 * Math.atan(Math.tan(radIn / 2) / aspect) * 180) / Math.PI;
  } else {
    vFov = fovIn;
    hFov = (2 * Math.atan(Math.tan(radIn / 2) * aspect) * 180) / Math.PI;
  }

  return [
    { label: 'Horizontal FOV', value: hFov.toFixed(2) + '°', primary: direction !== 'horizontal' },
    { label: 'Vertical FOV',   value: vFov.toFixed(2) + '°', primary: direction === 'horizontal' },
    { label: 'Aspect ratio',   value: `${w}:${h}  (${aspect.toFixed(3)})` },
    { label: 'Diagonal',       value: ((2 * Math.atan(Math.tan(radIn / 2) * Math.hypot(1, 1 / aspect)) * 180) / Math.PI).toFixed(2) + '°' },
  ];
}

export default function Tool() {
  return (
    <CalcTool
      toolId="game-fov"
      colorVar="--color-cat-game"
      inputs={[
        {
          id: 'direction', label: 'Input is', type: 'select', defaultValue: 'horizontal',
          options: [
            { value: 'horizontal', label: 'Horizontal FOV' },
            { value: 'vertical',   label: 'Vertical FOV' },
          ],
        },
        { id: 'fov',    label: 'FOV', unit: '°', defaultValue: 103 },
        { id: 'width',  label: 'Aspect width',  defaultValue: 16 },
        { id: 'height', label: 'Aspect height', defaultValue: 9 },
      ]}
      compute={compute}
    />
  );
}
