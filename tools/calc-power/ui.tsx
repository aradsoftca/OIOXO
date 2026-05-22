'use client';
import { CalcTool, type CalcResult } from '@/components/tool/CalcTool';

function compute(v: Record<string, string | number>): CalcResult[] {
  const V = Number(v.V);
  const I = Number(v.I);
  const R = Number(v.R);

  // Solve from any two
  let voltage = V, current = I, resistance = R, power: number;
  const hasV = Number.isFinite(V) && V > 0;
  const hasI = Number.isFinite(I) && I > 0;
  const hasR = Number.isFinite(R) && R > 0;

  if (hasV && hasI) {
    resistance = V / I;
    power = V * I;
  } else if (hasV && hasR) {
    current = V / R;
    power = (V * V) / R;
  } else if (hasI && hasR) {
    voltage = I * R;
    power = I * I * R;
  } else {
    return [{ label: 'Enter any two values', value: '—', primary: true, hint: 'V, I, or R' }];
  }

  return [
    { label: 'Power',      value: `${power.toFixed(3)} W`, primary: true },
    { label: 'Voltage',    value: `${voltage.toFixed(3)} V` },
    { label: 'Current',    value: `${current.toFixed(3)} A` },
    { label: 'Resistance', value: `${resistance.toFixed(3)} Ω` },
  ];
}

export default function PowerCalculator() {
  return (
    <CalcTool
      toolId="calc-power"
      inputs={[
        { id: 'V', label: 'Voltage',    unit: 'V', defaultValue: 12 },
        { id: 'I', label: 'Current',    unit: 'A', defaultValue: 2 },
        { id: 'R', label: 'Resistance', unit: 'Ω', defaultValue: 0 },
      ]}
      compute={compute}
      formula="V = I · R    P = V · I"
    />
  );
}
