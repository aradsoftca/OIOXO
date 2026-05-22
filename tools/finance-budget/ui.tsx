'use client';
import { CalcTool, type CalcResult } from '@/components/tool/CalcTool';

function compute(v: Record<string, string | number>): CalcResult[] {
  const income = Number(v.income) || 0;
  const housing = Number(v.housing) || 0;
  const food = Number(v.food) || 0;
  const transport = Number(v.transport) || 0;
  const utilities = Number(v.utilities) || 0;
  const other = Number(v.other) || 0;
  const expenses = housing + food + transport + utilities + other;
  const net = income - expenses;
  const rate = income > 0 ? (net / income) * 100 : 0;
  const fmt = (n: number) => n.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  return [
    { label: 'Net (per month)', value: fmt(net), primary: true, hint: rate >= 0 ? `${rate.toFixed(1)}% savings rate` : `${Math.abs(rate).toFixed(1)}% over budget` },
    { label: 'Total expenses',  value: fmt(expenses) },
    { label: 'Housing %',       value: income > 0 ? `${(housing / income * 100).toFixed(0)}%` : '—', hint: housing / income > 0.3 ? 'over 30% — high' : 'within healthy range' },
    { label: 'Annual savings',  value: fmt(net * 12) },
  ];
}

export default function Tool() {
  return (
    <CalcTool
      toolId="finance-budget"
      colorVar="--color-cat-finance"
      inputs={[
        { id: 'income',    label: 'Monthly income',    unit: '$', defaultValue: 6500 },
        { id: 'housing',   label: 'Housing',           unit: '$', defaultValue: 1800 },
        { id: 'food',      label: 'Food',              unit: '$', defaultValue: 700 },
        { id: 'transport', label: 'Transportation',    unit: '$', defaultValue: 400 },
        { id: 'utilities', label: 'Utilities & bills', unit: '$', defaultValue: 300 },
        { id: 'other',     label: 'Other',             unit: '$', defaultValue: 800 },
      ]}
      compute={compute}
    />
  );
}
