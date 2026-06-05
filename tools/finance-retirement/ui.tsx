'use client';
import { CalcTool, type CalcResult, type CalcChartSpec } from '@/components/tool/CalcTool';

const usd = (n: number) => n.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

function model(v: Record<string, string | number>) {
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
  const contributed = monthly * months;
  const gains = balance - current - contributed;
  const annualIncome = balance * withdrawalRate;
  return { current, contributed, gains, balance, annualIncome, retireAt, withdrawalRate, yearsToRetire };
}

function compute(v: Record<string, string | number>): CalcResult[] {
  const m = model(v);
  return [
    { label: `Nest egg at ${m.retireAt}`, value: usd(m.balance), primary: true },
    { label: `Annual income at ${m.withdrawalRate * 100}% rule`, value: usd(m.annualIncome) },
    { label: 'Monthly income',          value: usd(m.annualIncome / 12) },
    { label: 'Years until retirement',  value: String(m.yearsToRetire) },
  ];
}

function chart(v: Record<string, string | number>): CalcChartSpec | null {
  const m = model(v);
  if (m.balance <= 0) return null;
  return {
    type: 'donut',
    title: 'How the nest egg is built',
    format: usd,
    segments: [
      { label: 'Saved today', value: m.current },
      { label: 'Future contributions', value: Math.max(0, m.contributed) },
      { label: 'Compound growth', value: Math.max(0, m.gains) },
    ],
  };
}

export default function Tool() {
  return (
    <CalcTool
      toolId="finance-retirement"
      colorVar="--color-cat-finance"
      inputs={[
        { id: 'age',            label: 'Current age',                 defaultValue: 30, min: 18, max: 70, step: 1 },
        { id: 'retireAt',       label: 'Retire at',                   defaultValue: 65, min: 40, max: 80, step: 1 },
        { id: 'current',        label: 'Current savings',     unit: '$', defaultValue: 50000, min: 0, max: 1000000, step: 5000 },
        { id: 'monthly',        label: 'Monthly contribution', unit: '$', defaultValue: 800, min: 0, max: 10000, step: 50 },
        { id: 'growth',         label: 'Annual return',       unit: '%', defaultValue: 7, min: 0, max: 15, step: 0.5 },
        { id: 'withdrawalRate', label: 'Withdrawal rate',     unit: '%', defaultValue: 4, min: 2, max: 8, step: 0.5 },
      ]}
      compute={compute}
      chart={chart}
    />
  );
}
