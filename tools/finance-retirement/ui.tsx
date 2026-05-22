'use client';
import { CalcTool, type CalcResult } from '@/components/tool/CalcTool';

function compute(v: Record<string, string | number>): CalcResult[] {
  const age = Number(v.age) || 0;
  const retireAt = Number(v.retireAt) || 65;
  const current = Number(v.current) || 0;
  const monthly = Number(v.monthly) || 0;
  const growth = (Number(v.growth) || 7) / 100;
  const withdrawalRate = (Number(v.withdrawalRate) || 4) / 100;
  const yearsToRetire = Math.max(0, retireAt - age);
  const months = yearsToRetire * 12;
  const r = growth / 12;
  let balance = current;
  for (let i = 0; i < months; i++) balance = balance * (1 + r) + monthly;
  const annualIncome = balance * withdrawalRate;
  const fmt = (n: number) => n.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

  return [
    { label: `Nest egg at ${retireAt}`, value: fmt(balance), primary: true },
    { label: `Annual income at ${withdrawalRate * 100}% rule`, value: fmt(annualIncome) },
    { label: 'Monthly income',          value: fmt(annualIncome / 12) },
    { label: 'Years until retirement',  value: String(yearsToRetire) },
  ];
}

export default function Tool() {
  return (
    <CalcTool
      toolId="finance-retirement"
      colorVar="--color-cat-finance"
      inputs={[
        { id: 'age',            label: 'Current age',                 defaultValue: 30 },
        { id: 'retireAt',       label: 'Retire at',                   defaultValue: 65 },
        { id: 'current',        label: 'Current savings',     unit: '$', defaultValue: 50000 },
        { id: 'monthly',        label: 'Monthly contribution', unit: '$', defaultValue: 800 },
        { id: 'growth',         label: 'Annual return',       unit: '%', defaultValue: 7 },
        { id: 'withdrawalRate', label: 'Withdrawal rate',     unit: '%', defaultValue: 4 },
      ]}
      compute={compute}
    />
  );
}
