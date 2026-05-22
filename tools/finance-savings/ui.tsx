'use client';
import { CalcTool, type CalcResult } from '@/components/tool/CalcTool';

function compute(v: Record<string, string | number>): CalcResult[] {
  const goal = Number(v.goal) || 0;
  const current = Number(v.current) || 0;
  const years = Number(v.years) || 0;
  const rate = (Number(v.rate) || 0) / 100;
  const months = years * 12;
  const r = rate / 12;

  // Future value of current savings
  const fvCurrent = current * Math.pow(1 + r, months);
  const needed = goal - fvCurrent;
  // Required monthly contribution
  let monthly: number;
  if (months === 0) monthly = needed;
  else if (r === 0) monthly = needed / months;
  else monthly = (needed * r) / (Math.pow(1 + r, months) - 1);

  const totalContrib = monthly * months;
  const fmt = (n: number) => n.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  return [
    { label: 'Monthly deposit needed', value: fmt(Math.max(0, monthly)), primary: true, hint: needed < 0 ? 'Already on track — no deposits needed' : undefined },
    { label: 'Goal',                   value: fmt(goal) },
    { label: 'Future value of current savings', value: fmt(fvCurrent) },
    { label: 'Total to contribute',    value: fmt(Math.max(0, totalContrib)) },
    { label: 'Interest earned',        value: fmt(Math.max(0, goal - current - totalContrib)) },
  ];
}

export default function Tool() {
  return (
    <CalcTool
      toolId="finance-savings"
      colorVar="--color-cat-finance"
      inputs={[
        { id: 'goal',    label: 'Goal',           unit: '$',  defaultValue: 50000 },
        { id: 'current', label: 'Current saved',  unit: '$',  defaultValue: 5000 },
        { id: 'years',   label: 'Time horizon',   unit: 'yr', defaultValue: 5 },
        { id: 'rate',    label: 'APY',            unit: '%',  defaultValue: 4 },
      ]}
      compute={compute}
    />
  );
}
