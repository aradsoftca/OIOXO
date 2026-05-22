'use client';

import { CalcTool, type CalcResult } from '@/components/tool/CalcTool';

function category(bmi: number): { label: string; range: string } {
  if (bmi < 18.5) return { label: 'Underweight', range: '< 18.5' };
  if (bmi < 25) return { label: 'Healthy', range: '18.5 – 24.9' };
  if (bmi < 30) return { label: 'Overweight', range: '25 – 29.9' };
  return { label: 'Obese', range: '≥ 30' };
}

function compute(values: Record<string, string | number>): CalcResult[] {
  const unit = String(values['unit'] ?? 'metric');
  const w = Number(values['weight'] ?? 0);
  const h = Number(values['height'] ?? 0);
  if (w <= 0 || h <= 0) return [];

  let weightKg: number;
  let heightM: number;
  if (unit === 'metric') {
    weightKg = w;
    heightM = h / 100;
  } else {
    weightKg = w * 0.453592;
    heightM = h * 0.0254;
  }
  const bmi = weightKg / (heightM * heightM);
  const cat = category(bmi);

  const minKg = 18.5 * heightM * heightM;
  const maxKg = 24.9 * heightM * heightM;
  const healthyRange = unit === 'metric'
    ? `${minKg.toFixed(1)} – ${maxKg.toFixed(1)} kg`
    : `${(minKg / 0.453592).toFixed(1)} – ${(maxKg / 0.453592).toFixed(1)} lb`;

  return [
    { label: 'BMI', value: bmi.toFixed(1), primary: true, hint: `${cat.label} (${cat.range})` },
    { label: 'Healthy weight range', value: healthyRange },
  ];
}

export default function BmiCalculator() {
  return (
    <CalcTool
      toolId="calc-bmi"
      colorVar="--color-cat-calc"
      formula="BMI = weight ÷ height²"
      inputs={[
        {
          id: 'unit',
          label: 'Units',
          type: 'select',
          defaultValue: 'metric',
          options: [
            { value: 'metric', label: 'Metric (kg / cm)' },
            { value: 'imperial', label: 'Imperial (lb / in)' },
          ],
        },
        { id: 'weight', label: 'Weight', defaultValue: 70, unit: 'kg / lb' },
        { id: 'height', label: 'Height', defaultValue: 170, unit: 'cm / in' },
      ]}
      compute={compute}
    />
  );
}
