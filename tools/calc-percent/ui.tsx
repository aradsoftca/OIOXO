'use client';

import { CalcTool, type CalcResult } from '@/components/tool/CalcTool';

function compute(values: Record<string, string | number>): CalcResult[] {
  const mode = String(values['mode'] ?? 'of');
  const a = Number(values['a'] ?? 0);
  const b = Number(values['b'] ?? 0);

  if (mode === 'of') {
    // a% of b
    return [
      { label: `${a}% of ${b}`, value: (a * b / 100).toLocaleString(), primary: true },
      { label: 'Decimal', value: (a * b / 100).toFixed(6) },
    ];
  }
  if (mode === 'isWhatPercentOf') {
    // a is what % of b
    if (b === 0) return [{ label: 'Division by zero', value: '∞', primary: true }];
    const pct = (a / b) * 100;
    return [
      { label: `${a} is what % of ${b}`, value: `${pct.toFixed(2)}%`, primary: true },
      { label: 'Ratio', value: (a / b).toFixed(6) },
    ];
  }
  // change — from a to b
  if (a === 0) return [{ label: 'Cannot compute change from 0', value: '∞', primary: true }];
  const change = ((b - a) / a) * 100;
  return [
    {
      label: `Change ${a} → ${b}`,
      value: `${change >= 0 ? '+' : ''}${change.toFixed(2)}%`,
      primary: true,
      hint: change >= 0 ? 'increase' : 'decrease',
    },
    { label: 'Difference', value: (b - a).toLocaleString() },
  ];
}

export default function PercentCalculator() {
  return (
    <CalcTool
      toolId="calc-percent"
      colorVar="--color-cat-calc"
      inputs={[
        {
          id: 'mode',
          label: 'Calculate',
          type: 'select',
          defaultValue: 'of',
          options: [
            { value: 'of', label: 'A% of B' },
            { value: 'isWhatPercentOf', label: 'A is what % of B' },
            { value: 'change', label: 'Percent change A → B' },
          ],
        },
        { id: 'a', label: 'A', defaultValue: 15 },
        { id: 'b', label: 'B', defaultValue: 200 },
      ]}
      compute={compute}
      formula="A% of B = A × B / 100"
    />
  );
}
