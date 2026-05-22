'use client';
import { CalcTool, type CalcResult } from '@/components/tool/CalcTool';

const TO_CELSIUS: Record<string, (v: number) => number> = {
  C: (v) => v,
  F: (v) => (v - 32) * 5 / 9,
  K: (v) => v - 273.15,
  R: (v) => (v - 491.67) * 5 / 9,
};

function compute(v: Record<string, string | number>): CalcResult[] {
  const value = Number(v.value);
  const from = String(v.from);
  if (!Number.isFinite(value)) return [{ label: 'Enter a number', value: '—', primary: true }];
  const c = TO_CELSIUS[from]?.(value);
  if (c === undefined) return [{ label: 'Unknown scale', value: '—', primary: true }];
  const f = c * 9 / 5 + 32;
  const k = c + 273.15;
  const r = c * 9 / 5 + 491.67;
  const fmt = (n: number, scale: string) => `${n.toFixed(2)} °${scale}`;
  const primaryScale: Record<string, [number, string]> = {
    C: [c, 'C'], F: [f, 'F'], K: [k, 'K'], R: [r, 'R'],
  };
  // Show "from" as primary, others as supplementary
  const [pv, ps] = primaryScale[from];
  return [
    { label: `${value} °${from}`, value: fmt(pv, ps), primary: true },
    ...(['C', 'F', 'K', 'R'] as const).filter((s) => s !== from).map((s) => {
      const [nv, ns] = primaryScale[s];
      return { label: `In ${ns === 'R' ? 'Rankine' : ns === 'K' ? 'Kelvin' : ns === 'F' ? 'Fahrenheit' : 'Celsius'}`, value: fmt(nv, ns) };
    }),
  ];
}

export default function TempCalculator() {
  return (
    <CalcTool
      toolId="calc-temp"
      inputs={[
        {
          id: 'from', label: 'From', type: 'select', defaultValue: 'C',
          options: [
            { value: 'C', label: 'Celsius (°C)' },
            { value: 'F', label: 'Fahrenheit (°F)' },
            { value: 'K', label: 'Kelvin (K)' },
            { value: 'R', label: 'Rankine (°R)' },
          ],
        },
        { id: 'value', label: 'Value', defaultValue: 100 },
      ]}
      compute={compute}
    />
  );
}
