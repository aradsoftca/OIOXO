'use client';
import { CalcTool, type CalcResult } from '@/components/tool/CalcTool';

function compute(v: Record<string, string | number>): CalcResult[] {
  const price = Number(v.price) || 0;
  const downPct = Number(v.downPct) || 0;
  const rate = (Number(v.rate) || 0) / 100;
  const years = Number(v.years) || 0;
  const taxRate = (Number(v.taxRate) || 0) / 100;
  const insurance = Number(v.insurance) || 0;
  if (price <= 0 || years <= 0) return [{ label: 'Enter values', value: '—', primary: true }];

  const principal = price * (1 - downPct / 100);
  const months = years * 12;
  const r = rate / 12;
  const piMonthly = r === 0 ? principal / months : (principal * r) / (1 - Math.pow(1 + r, -months));
  const tax = (price * taxRate) / 12;
  const total = piMonthly + tax + insurance;

  const totalPaid = piMonthly * months;
  const totalInterest = totalPaid - principal;
  const fmt = (n: number) => n.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  return [
    { label: 'Monthly payment (PITI)', value: fmt(total), primary: true },
    { label: 'Principal & interest',   value: fmt(piMonthly) },
    { label: 'Property tax / month',   value: fmt(tax) },
    { label: 'Insurance / month',      value: fmt(insurance) },
    { label: 'Loan amount',            value: fmt(principal) },
    { label: 'Total interest paid',    value: fmt(totalInterest) },
  ];
}

export default function Tool() {
  return (
    <CalcTool
      toolId="finance-mortgage"
      colorVar="--color-cat-finance"
      inputs={[
        { id: 'price',     label: 'Home price',     unit: '$', defaultValue: 450000 },
        { id: 'downPct',   label: 'Down payment',   unit: '%', defaultValue: 20 },
        { id: 'rate',      label: 'Interest rate',  unit: '%', defaultValue: 6.5 },
        { id: 'years',     label: 'Term',           unit: 'yr', defaultValue: 30 },
        { id: 'taxRate',   label: 'Property tax',   unit: '%', defaultValue: 1.2 },
        { id: 'insurance', label: 'Insurance /mo',  unit: '$', defaultValue: 100 },
      ]}
      compute={compute}
      formula="PITI = P&I + Tax + Insurance"
    />
  );
}
