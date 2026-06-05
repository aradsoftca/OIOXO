'use client';
import { CalcTool, type CalcResult, type CalcChartSpec } from '@/components/tool/CalcTool';

const usd = (n: number) => n.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

function payment(principal: number, annualRate: number, years: number): { monthly: number; total: number; interest: number } | null {
  if (principal <= 0 || years <= 0) return null;
  const months = years * 12;
  const r = annualRate / 100 / 12;
  const monthly = r === 0 ? principal / months : (principal * r) / (1 - Math.pow(1 + r, -months));
  const total = monthly * months;
  return { monthly, total, interest: total - principal };
}

function model(v: Record<string, string | number>) {
  const a = payment(Number(v.principalA) || 0, Number(v.rateA) || 0, Number(v.yearsA) || 0);
  const b = payment(Number(v.principalB) || 0, Number(v.rateB) || 0, Number(v.yearsB) || 0);
  if (!a || !b) return null;
  return { a, b };
}

function compute(v: Record<string, string | number>): CalcResult[] {
  const m = model(v);
  if (!m) return [{ label: 'Enter both loans', value: '—', primary: true }];
  const { a, b } = m;
  const diffMonthly = a.monthly - b.monthly;
  const diffTotal = a.total - b.total;
  const winner = diffTotal > 0 ? 'B' : diffTotal < 0 ? 'A' : 'tie';
  return [
    { label: `Cheaper total — Loan ${winner}`, value: usd(Math.abs(diffTotal)), primary: true, hint: `${winner === 'tie' ? 'Same' : winner} saves over the term` },
    { label: 'Loan A monthly',     value: usd(a.monthly) },
    { label: 'Loan B monthly',     value: usd(b.monthly) },
    { label: 'Monthly difference', value: `${diffMonthly >= 0 ? 'A higher by ' : 'B higher by '}${usd(Math.abs(diffMonthly))}` },
    { label: 'Loan A total interest', value: usd(a.interest) },
    { label: 'Loan B total interest', value: usd(b.interest) },
  ];
}

function chart(v: Record<string, string | number>): CalcChartSpec | null {
  const m = model(v);
  if (!m) return null;
  return {
    type: 'bars',
    title: 'Total interest paid — lower wins',
    format: usd,
    segments: [
      { label: 'Loan A interest', value: m.a.interest },
      { label: 'Loan B interest', value: m.b.interest, color: 'color-mix(in oklch, var(--color-cat-finance) 45%, var(--color-surface-2))' },
    ],
  };
}

export default function Tool() {
  return (
    <CalcTool
      toolId="finance-loan-comparison"
      colorVar="--color-cat-finance"
      inputs={[
        { id: 'principalA', label: 'Loan A — amount',    unit: '$',  defaultValue: 250000, min: 1000, max: 1000000, step: 1000 },
        { id: 'rateA',      label: 'Loan A — rate',      unit: '%',  defaultValue: 6.5, min: 0, max: 20, step: 0.1 },
        { id: 'yearsA',     label: 'Loan A — term',      unit: 'yr', defaultValue: 30, min: 1, max: 40, step: 1 },
        { id: 'principalB', label: 'Loan B — amount',    unit: '$',  defaultValue: 250000, min: 1000, max: 1000000, step: 1000 },
        { id: 'rateB',      label: 'Loan B — rate',      unit: '%',  defaultValue: 5.75, min: 0, max: 20, step: 0.1 },
        { id: 'yearsB',     label: 'Loan B — term',      unit: 'yr', defaultValue: 15, min: 1, max: 40, step: 1 },
      ]}
      compute={compute}
      chart={chart}
    />
  );
}
