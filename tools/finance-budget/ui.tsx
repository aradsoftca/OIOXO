'use client';
import { CalcTool, type CalcResult, type CalcChartSpec } from '@/components/tool/CalcTool';

const usd = (n: number) => n.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

function model(v: Record<string, string | number>) {
  const income = Number(v.income) || 0;
  const housing = Number(v.housing) || 0;
  const food = Number(v.food) || 0;
  const transport = Number(v.transport) || 0;
  const utilities = Number(v.utilities) || 0;
  const other = Number(v.other) || 0;
  const expenses = housing + food + transport + utilities + other;
  const net = income - expenses;
  const rate = income > 0 ? (net / income) * 100 : 0;
  return { income, housing, food, transport, utilities, other, expenses, net, rate };
}

function compute(v: Record<string, string | number>): CalcResult[] {
  const m = model(v);
  return [
    { label: 'Net (per month)', value: usd(m.net), primary: true, hint: m.rate >= 0 ? `${m.rate.toFixed(1)}% savings rate` : `${Math.abs(m.rate).toFixed(1)}% over budget` },
    { label: 'Total expenses',  value: usd(m.expenses) },
    { label: 'Housing %',       value: m.income > 0 ? `${(m.housing / m.income * 100).toFixed(0)}%` : '—', hint: m.housing / m.income > 0.3 ? 'over 30% — high' : 'within healthy range' },
    { label: 'Annual savings',  value: usd(m.net * 12) },
  ];
}

function chart(v: Record<string, string | number>): CalcChartSpec | null {
  const m = model(v);
  if (m.expenses <= 0) return null;
  const segments = [
    { label: 'Housing', value: m.housing },
    { label: 'Food', value: m.food },
    { label: 'Transport', value: m.transport },
    { label: 'Utilities', value: m.utilities },
    { label: 'Other', value: m.other },
  ];
  if (m.net > 0) segments.push({ label: 'Left over', value: m.net });
  return { type: 'donut', title: 'Where the money goes', format: usd, segments };
}

export default function Tool() {
  return (
    <CalcTool
      toolId="finance-budget"
      colorVar="--color-cat-finance"
      inputs={[
        { id: 'income',    label: 'Monthly income',    unit: '$', defaultValue: 6500, min: 0, max: 30000, step: 100 },
        { id: 'housing',   label: 'Housing',           unit: '$', defaultValue: 1800, min: 0, max: 10000, step: 50 },
        { id: 'food',      label: 'Food',              unit: '$', defaultValue: 700, min: 0, max: 5000, step: 50 },
        { id: 'transport', label: 'Transportation',    unit: '$', defaultValue: 400, min: 0, max: 5000, step: 50 },
        { id: 'utilities', label: 'Utilities & bills', unit: '$', defaultValue: 300, min: 0, max: 5000, step: 25 },
        { id: 'other',     label: 'Other',             unit: '$', defaultValue: 800, min: 0, max: 10000, step: 50 },
      ]}
      compute={compute}
      chart={chart}
    />
  );
}
