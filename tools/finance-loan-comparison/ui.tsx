'use client';
import { CalcTool, type CalcResult } from '@/components/tool/CalcTool';

function payment(principal: number, annualRate: number, years: number): { monthly: number; total: number; interest: number } | null {
  if (principal <= 0 || years <= 0) return null;
  const months = years * 12;
  const r = annualRate / 100 / 12;
  const monthly = r === 0 ? principal / months : (principal * r) / (1 - Math.pow(1 + r, -months));
  const total = monthly * months;
  return { monthly, total, interest: total - principal };
}

function compute(v: Record<string, string | number>): CalcResult[] {
  const a = payment(Number(v.principalA) || 0, Number(v.rateA) || 0, Number(v.yearsA) || 0);
  const b = payment(Number(v.principalB) || 0, Number(v.rateB) || 0, Number(v.yearsB) || 0);
  if (!a || !b) return [{ label: 'Enter both loans', value: '—', primary: true }];
  const fmt = (n: number) => n.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  const diffMonthly = a.monthly - b.monthly;
  const diffTotal = a.total - b.total;
  const winner = diffTotal > 0 ? 'B' : diffTotal < 0 ? 'A' : 'tie';
  return [
    { label: `Cheaper total — Loan ${winner}`, value: fmt(Math.abs(diffTotal)), primary: true, hint: `${winner === 'tie' ? 'Same' : winner} saves over the term` },
    { label: 'Loan A monthly',     value: fmt(a.monthly) },
    { label: 'Loan B monthly',     value: fmt(b.monthly) },
    { label: 'Monthly difference', value: `${diffMonthly >= 0 ? 'A higher by ' : 'B higher by '}${fmt(Math.abs(diffMonthly))}` },
    { label: 'Loan A total interest', value: fmt(a.interest) },
    { label: 'Loan B total interest', value: fmt(b.interest) },
  ];
}

export default function Tool() {
  return (
    <CalcTool
      toolId="finance-loan-comparison"
      colorVar="--color-cat-finance"
      inputs={[
        { id: 'principalA', label: 'Loan A — amount',    unit: '$',  defaultValue: 250000 },
        { id: 'rateA',      label: 'Loan A — rate',      unit: '%',  defaultValue: 6.5 },
        { id: 'yearsA',     label: 'Loan A — term',      unit: 'yr', defaultValue: 30 },
        { id: 'principalB', label: 'Loan B — amount',    unit: '$',  defaultValue: 250000 },
        { id: 'rateB',      label: 'Loan B — rate',      unit: '%',  defaultValue: 5.75 },
        { id: 'yearsB',     label: 'Loan B — term',      unit: 'yr', defaultValue: 15 },
      ]}
      compute={compute}
    />
  );
}
