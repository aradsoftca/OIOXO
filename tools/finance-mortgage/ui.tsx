'use client';
import { CalcTool, type CalcResult, type CalcChartSpec } from '@/components/tool/CalcTool';

const usd = (n: number) => n.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

function model(v: Record<string, string | number>) {
  const price = Number(v.price) || 0;
  const downPct = Number(v.downPct) || 0;
  const rate = (Number(v.rate) || 0) / 100;
  const years = Number(v.years) || 0;
  const taxRate = (Number(v.taxRate) || 0) / 100;
  const insurance = Number(v.insurance) || 0;
  if (price <= 0 || years <= 0) return null;

  const principal = price * (1 - downPct / 100);
  const months = years * 12;
  const r = rate / 12;
  const piMonthly = r === 0 ? principal / months : (principal * r) / (1 - Math.pow(1 + r, -months));
  const tax = (price * taxRate) / 12;
  const total = piMonthly + tax + insurance;
  const totalPaid = piMonthly * months;
  const totalInterest = totalPaid - principal;
  return { principal, piMonthly, tax, insurance, total, totalInterest };
}

function compute(v: Record<string, string | number>): CalcResult[] {
  const m = model(v);
  if (!m) return [{ label: 'Enter values', value: '—', primary: true }];
  return [
    { label: 'Monthly payment (PITI)', value: usd(m.total), primary: true },
    { label: 'Principal & interest',   value: usd(m.piMonthly) },
    { label: 'Property tax / month',   value: usd(m.tax) },
    { label: 'Insurance / month',      value: usd(m.insurance) },
    { label: 'Loan amount',            value: usd(m.principal) },
    { label: 'Total interest paid',    value: usd(m.totalInterest) },
  ];
}

function chart(v: Record<string, string | number>): CalcChartSpec | null {
  const m = model(v);
  if (!m) return null;
  return {
    type: 'donut',
    title: 'Total cost of the loan',
    format: usd,
    segments: [
      { label: 'Principal', value: m.principal },
      { label: 'Interest', value: m.totalInterest },
    ],
  };
}

export default function Tool() {
  return (
    <CalcTool
      toolId="finance-mortgage"
      colorVar="--color-cat-finance"
      inputs={[
        { id: 'price',     label: 'Home price',     unit: '$', defaultValue: 450000, min: 50000, max: 2000000, step: 5000 },
        { id: 'downPct',   label: 'Down payment',   unit: '%', defaultValue: 20, min: 0, max: 60, step: 1 },
        { id: 'rate',      label: 'Interest rate',  unit: '%', defaultValue: 6.5, min: 0, max: 12, step: 0.1 },
        { id: 'years',     label: 'Term',           unit: 'yr', defaultValue: 30, min: 5, max: 40, step: 1 },
        { id: 'taxRate',   label: 'Property tax',   unit: '%', defaultValue: 1.2, min: 0, max: 4, step: 0.1 },
        { id: 'insurance', label: 'Insurance /mo',  unit: '$', defaultValue: 100, min: 0, max: 1000, step: 10 },
      ]}
      compute={compute}
      chart={chart}
      formula="PITI = P&I + Tax + Insurance"
    />
  );
}
