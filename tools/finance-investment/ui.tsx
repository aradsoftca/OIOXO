'use client';
import { CalcTool, type CalcResult, type CalcChartSpec } from '@/components/tool/CalcTool';

const usd = (n: number) => n.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

function model(v: Record<string, string | number>) {
  const initial = Number(v.initial) || 0;
  const monthly = Number(v.monthly) || 0;
  const years = Number(v.years) || 0;
  const annualReturn = (Number(v.rate) || 0) / 100;
  const inflation = (Number(v.inflation) || 0) / 100;
  const months = years * 12;
  const r = annualReturn / 12;

  let balance = initial;
  for (let i = 0; i < months; i++) balance = balance * (1 + r) + monthly;
  const totalContributed = initial + monthly * months;
  const gains = balance - totalContributed;
  const realBalance = balance / Math.pow(1 + inflation, years);
  return { initial, monthlyContrib: monthly * months, balance, totalContributed, gains, realBalance, years };
}

function compute(v: Record<string, string | number>): CalcResult[] {
  const m = model(v);
  return [
    { label: `Balance after ${m.years} yr`, value: usd(m.balance), primary: true },
    { label: 'Total contributed',        value: usd(m.totalContributed) },
    { label: 'Investment gains',         value: usd(m.gains) },
    { label: 'Inflation-adjusted',       value: usd(m.realBalance), hint: `in today's dollars` },
  ];
}

function chart(v: Record<string, string | number>): CalcChartSpec | null {
  const m = model(v);
  if (m.balance <= 0) return null;
  return {
    type: 'donut',
    title: 'What builds your balance',
    format: usd,
    segments: [
      { label: 'Initial deposit', value: m.initial },
      { label: 'Contributions', value: m.monthlyContrib },
      { label: 'Compound gains', value: Math.max(0, m.gains) },
    ],
  };
}

export default function Tool() {
  return (
    <CalcTool
      toolId="finance-investment"
      colorVar="--color-cat-finance"
      inputs={[
        { id: 'initial',   label: 'Initial investment', unit: '$', defaultValue: 10000, min: 0, max: 500000, step: 1000 },
        { id: 'monthly',   label: 'Monthly contribution', unit: '$', defaultValue: 500, min: 0, max: 10000, step: 50 },
        { id: 'years',     label: 'Years',              unit: 'yr', defaultValue: 25, min: 1, max: 50, step: 1 },
        { id: 'rate',      label: 'Expected return',    unit: '%/yr', defaultValue: 7, min: 0, max: 15, step: 0.5 },
        { id: 'inflation', label: 'Inflation',          unit: '%/yr', defaultValue: 2.5, min: 0, max: 10, step: 0.5 },
      ]}
      compute={compute}
      chart={chart}
    />
  );
}
