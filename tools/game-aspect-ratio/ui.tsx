'use client';
import { CalcTool, type CalcResult } from '@/components/tool/CalcTool';

function gcd(a: number, b: number): number { return b === 0 ? a : gcd(b, a % b); }

const COMMON_NAMES: Array<[number, string]> = [
  [4 / 3,     '4:3'],
  [3 / 2,     '3:2'],
  [16 / 10,   '16:10'],
  [16 / 9,    '16:9'],
  [17 / 9,    '17:9'],
  [21 / 9,    '21:9'],
  [32 / 9,    '32:9'],
  [1,         '1:1'],
];

function compute(v: Record<string, string | number>): CalcResult[] {
  const w = Math.max(1, Number(v.width) || 1920);
  const h = Math.max(1, Number(v.height) || 1080);
  const d = gcd(w, h);
  const ratio = w / h;
  let named = `${w / d}:${h / d}`;
  for (const [r, n] of COMMON_NAMES) if (Math.abs(ratio - r) < 0.005) { named = n; break; }
  // Suggested resolutions matching this ratio
  const heights = [720, 1080, 1440, 2160];
  const suggestions = heights.map((H) => `${Math.round(H * ratio)} × ${H}`).join(', ');
  return [
    { label: 'Aspect',       value: named, primary: true },
    { label: 'Ratio',        value: ratio.toFixed(4) },
    { label: 'Reduced form', value: `${w / d} : ${h / d}` },
    { label: 'Common matches', value: suggestions },
  ];
}

export default function Tool() {
  return (
    <CalcTool
      toolId="game-aspect-ratio"
      colorVar="--color-cat-game"
      inputs={[
        { id: 'width',  label: 'Width  (px)',  defaultValue: 1920 },
        { id: 'height', label: 'Height (px)',  defaultValue: 1080 },
      ]}
      compute={compute}
    />
  );
}
