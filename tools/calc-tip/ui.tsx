'use client';
import { CalcTool, type CalcResult } from '@/components/tool/CalcTool';

function compute(v: Record<string, string | number>): CalcResult[] {
  const bill = Number(v.bill) || 0;
  const tipPct = Number(v.tip) || 0;
  const people = Math.max(1, Number(v.people) || 1);
  const tip = bill * tipPct / 100;
  const total = bill + tip;
  const perPerson = total / people;
  const fmt = (n: number) => n.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
  return [
    { label: 'Per person', value: fmt(perPerson), primary: true },
    { label: 'Tip',        value: fmt(tip) },
    { label: 'Total',      value: fmt(total) },
  ];
}

export default function TipCalculator() {
  return (
    <CalcTool
      toolId="calc-tip"
      inputs={[
        { id: 'bill',   label: 'Bill amount', unit: '$', defaultValue: 50 },
        { id: 'tip',    label: 'Tip',         unit: '%', defaultValue: 18 },
        { id: 'people', label: 'Split among', defaultValue: 2 },
      ]}
      compute={compute}
    />
  );
}
