'use client';
import { CalcTool, type CalcResult } from '@/components/tool/CalcTool';

function compute(v: Record<string, string | number>): CalcResult[] {
  const initial = Number(v.initial) || 0;
  const monthly = Number(v.monthly) || 0;
  const years = Number(v.years) || 0;
  const annualReturn = (Number(v.rate) || 0) / 100;
  const inflation = (Number(v.inflation) || 0) / 100;
  const months = years * 12;
  const r = annualReturn / 12;

  let balance = initial;
  for (let i = 0; i < months; i++) {
    balance = balance * (1 + r) + monthly;
  }
  const totalContributed = initial + monthly * months;
  const gains = balance - totalContributed;
  const realBalance = balance / Math.pow(1 + inflation, years);
  const fmt = (n: number) => n.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  return [
    { label: `Balance after ${years} yr`, value: fmt(balance), primary: true },
    { label: 'Total contributed',        value: fmt(totalContributed) },
    { label: 'Investment gains',         value: fmt(gains) },
    { label: 'Inflation-adjusted',       value: fmt(realBalance), hint: `in today's dollars` },
  ];
}

export default function Tool() {
  return (
    <CalcTool
      toolId="finance-investment"
      colorVar="--color-cat-finance"
      inputs={[
        { id: 'initial',   label: 'Initial investment', unit: '$', defaultValue: 10000 },
        { id: 'monthly',   label: 'Monthly contribution', unit: '$', defaultValue: 500 },
        { id: 'years',     label: 'Years',              unit: 'yr', defaultValue: 25 },
        { id: 'rate',      label: 'Expected return',    unit: '%/yr', defaultValue: 7 },
        { id: 'inflation', label: 'Inflation',          unit: '%/yr', defaultValue: 2.5 },
      ]}
      compute={compute}
    />
  );
}
