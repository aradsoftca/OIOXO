'use client';
import { CalcTool, type CalcResult, type CalcChartSpec } from '@/components/tool/CalcTool';

const usd = (n: number) => n.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

function model(v: Record<string, string | number>) {
  const goal = Number(v.goal) || 0;
  const current = Number(v.current) || 0;
  const years = Number(v.years) || 0;
  const rate = (Number(v.rate) || 0) / 100;
  const months = years * 12;
  const r = rate / 12;

  const fvCurrent = current * Math.pow(1 + r, months);
  const needed = goal - fvCurrent;
  let monthly: number;
  if (months === 0) monthly = needed;
  else if (r === 0) monthly = needed / months;
  else monthly = (needed * r) / (Math.pow(1 + r, months) - 1);

  const totalContrib = Math.max(0, monthly * months);
  const interest = Math.max(0, goal - current - totalContrib);
  return { goal, current, fvCurrent, monthly: Math.max(0, monthly), totalContrib, interest, needed };
}

function compute(v: Record<string, string | number>): CalcResult[] {
  const m = model(v);
  return [
    { label: 'Monthly deposit needed', value: usd(m.monthly), primary: true, hint: m.needed < 0 ? 'Already on track — no deposits needed' : undefined },
    { label: 'Goal',                   value: usd(m.goal) },
    { label: 'Future value of current savings', value: usd(m.fvCurrent) },
    { label: 'Total to contribute',    value: usd(m.totalContrib) },
    { label: 'Interest earned',        value: usd(m.interest) },
  ];
}

function chart(v: Record<string, string | number>): CalcChartSpec | null {
  const m = model(v);
  if (m.goal <= 0) return null;
  return {
    type: 'donut',
    title: 'How you reach the goal',
    format: usd,
    segments: [
      { label: 'Saved so far', value: Math.min(m.current, m.goal) },
      { label: 'Future deposits', value: m.totalContrib },
      { label: 'Interest earned', value: m.interest },
    ],
  };
}

export default function Tool() {
  return (
    <CalcTool
      toolId="finance-savings"
      colorVar="--color-cat-finance"
      inputs={[
        { id: 'goal',    label: 'Goal',           unit: '$',  defaultValue: 50000, min: 1000, max: 1000000, step: 1000 },
        { id: 'current', label: 'Current saved',  unit: '$',  defaultValue: 5000, min: 0, max: 500000, step: 500 },
        { id: 'years',   label: 'Time horizon',   unit: 'yr', defaultValue: 5, min: 1, max: 40, step: 1 },
        { id: 'rate',    label: 'APY',            unit: '%',  defaultValue: 4, min: 0, max: 12, step: 0.25 },
      ]}
      compute={compute}
      chart={chart}
    />
  );
}
