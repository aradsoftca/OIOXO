'use client';
import { CalcTool, type CalcResult } from '@/components/tool/CalcTool';

function compute(v: Record<string, string | number>): CalcResult[] {
  const principal = Number(v.principal) || 0;
  const annualRate = (Number(v.rate) || 0) / 100;
  const years = Number(v.years) || 0;
  const months = years * 12;
  const r = annualRate / 12;
  if (principal <= 0 || months <= 0) return [{ label: 'Enter loan details', value: '—', primary: true }];
  const monthly = r === 0 ? principal / months : (principal * r) / (1 - Math.pow(1 + r, -months));
  const total = monthly * months;
  const interest = total - principal;
  const fmt = (n: number) => n.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
  return [
    { label: 'Monthly payment', value: fmt(monthly), primary: true },
    { label: 'Total paid',      value: fmt(total) },
    { label: 'Total interest',  value: fmt(interest) },
    { label: 'Principal',       value: fmt(principal) },
  ];
}

export default function LoanCalculator() {
  return (
    <CalcTool
      toolId="calc-loan"
      inputs={[
        { id: 'principal', label: 'Loan amount',  unit: '$',  defaultValue: 250000 },
        { id: 'rate',      label: 'Annual rate',  unit: '%',  defaultValue: 6.5 },
        { id: 'years',     label: 'Term',         unit: 'yr', defaultValue: 30 },
      ]}
      compute={compute}
      formula="M = P · r / (1 − (1 + r)⁻ⁿ)"
    />
  );
}
