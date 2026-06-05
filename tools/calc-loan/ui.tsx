'use client';
import { CalcTool, type CalcResult, type CalcChartSpec } from '@/components/tool/CalcTool';

const usd = (n: number) => n.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });

function model(v: Record<string, string | number>) {
  const principal = Number(v.principal) || 0;
  const annualRate = (Number(v.rate) || 0) / 100;
  const years = Number(v.years) || 0;
  const months = years * 12;
  const r = annualRate / 12;
  if (principal <= 0 || months <= 0) return null;
  const monthly = r === 0 ? principal / months : (principal * r) / (1 - Math.pow(1 + r, -months));
  const total = monthly * months;
  return { principal, monthly, total, interest: total - principal };
}

function compute(v: Record<string, string | number>): CalcResult[] {
  const m = model(v);
  if (!m) return [{ label: 'Enter loan details', value: '—', primary: true }];
  return [
    { label: 'Monthly payment', value: usd(m.monthly), primary: true },
    { label: 'Total paid',      value: usd(m.total) },
    { label: 'Total interest',  value: usd(m.interest) },
    { label: 'Principal',       value: usd(m.principal) },
  ];
}

function chart(v: Record<string, string | number>): CalcChartSpec | null {
  const m = model(v);
  if (!m) return null;
  return {
    type: 'donut',
    title: 'Where your payments go',
    format: usd,
    segments: [
      { label: 'Principal', value: m.principal },
      { label: 'Interest', value: m.interest },
    ],
  };
}

export default function LoanCalculator() {
  return (
    <CalcTool
      toolId="calc-loan"
      inputs={[
        { id: 'principal', label: 'Loan amount',  unit: '$',  defaultValue: 250000, min: 1000, max: 1000000, step: 1000 },
        { id: 'rate',      label: 'Annual rate',  unit: '%',  defaultValue: 6.5, min: 0, max: 20, step: 0.1 },
        { id: 'years',     label: 'Term',         unit: 'yr', defaultValue: 30, min: 1, max: 40, step: 1 },
      ]}
      compute={compute}
      chart={chart}
      formula="M = P · r / (1 − (1 + r)⁻ⁿ)"
    />
  );
}
