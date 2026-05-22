'use client';
import { CalcTool, type CalcResult } from '@/components/tool/CalcTool';

// 2024 US federal tax brackets — single / MFJ. Educational estimate; not tax advice.
const BRACKETS = {
  single: [
    [11600,    0.10],
    [47150,    0.12],
    [100525,   0.22],
    [191950,   0.24],
    [243725,   0.32],
    [609350,   0.35],
    [Infinity, 0.37],
  ] as [number, number][],
  married: [
    [23200,    0.10],
    [94300,    0.12],
    [201050,   0.22],
    [383900,   0.24],
    [487450,   0.32],
    [731200,   0.35],
    [Infinity, 0.37],
  ] as [number, number][],
};

const STANDARD_DEDUCTION = { single: 14600, married: 29200 };

function compute(v: Record<string, string | number>): CalcResult[] {
  const filing = String(v.filing ?? 'single') as 'single' | 'married';
  const gross = Number(v.gross) || 0;
  const useStandard = v.useStandard !== 'false';
  const customDed = Number(v.deduction) || 0;
  const deduction = useStandard ? STANDARD_DEDUCTION[filing] : customDed;
  const taxable = Math.max(0, gross - deduction);
  const brackets = BRACKETS[filing];

  let tax = 0;
  let lastCap = 0;
  let marginal = brackets[0][1];
  for (const [cap, rate] of brackets) {
    if (taxable > cap) {
      tax += (cap - lastCap) * rate;
      lastCap = cap;
    } else {
      tax += (taxable - lastCap) * rate;
      marginal = rate;
      break;
    }
  }
  const effective = gross > 0 ? (tax / gross) * 100 : 0;
  const takeHome = gross - tax;
  const fmt = (n: number) => n.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  return [
    { label: 'Federal tax owed',  value: fmt(tax), primary: true },
    { label: 'Take-home',         value: fmt(takeHome) },
    { label: 'Marginal rate',     value: `${(marginal * 100).toFixed(0)}%` },
    { label: 'Effective rate',    value: `${effective.toFixed(2)}%` },
    { label: 'Taxable income',    value: fmt(taxable) },
    { label: 'Deduction applied', value: fmt(deduction) },
  ];
}

export default function Tool() {
  return (
    <CalcTool
      toolId="finance-tax"
      colorVar="--color-cat-finance"
      inputs={[
        {
          id: 'filing', label: 'Filing status', type: 'select', defaultValue: 'single',
          options: [
            { value: 'single',  label: 'Single' },
            { value: 'married', label: 'Married filing jointly' },
          ],
        },
        { id: 'gross', label: 'Gross income', unit: '$', defaultValue: 85000 },
        {
          id: 'useStandard', label: 'Deduction', type: 'select', defaultValue: 'true',
          options: [
            { value: 'true',  label: 'Standard deduction' },
            { value: 'false', label: 'Custom (itemized)' },
          ],
        },
        { id: 'deduction', label: 'Custom deduction', unit: '$', defaultValue: 14600 },
      ]}
      compute={compute}
      formula="Tax = Σ (taxable in bracket × bracket rate)  ·  US 2024"
    />
  );
}
