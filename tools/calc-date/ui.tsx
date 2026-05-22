'use client';
import { CalcTool, type CalcResult } from '@/components/tool/CalcTool';

function compute(v: Record<string, string | number>): CalcResult[] {
  const a = new Date(String(v.from));
  const b = new Date(String(v.to));
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) {
    return [{ label: 'Enter valid dates', value: '—', primary: true }];
  }
  const ms = b.getTime() - a.getTime();
  const days = ms / 86_400_000;
  const sign = days >= 0 ? '' : '−';
  const abs = Math.abs(days);

  // Calendar-aware month diff
  let months = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
  if (b.getDate() < a.getDate()) months -= 1;

  return [
    { label: 'Days between',  value: `${sign}${abs.toFixed(0)}`, primary: true, hint: 'calendar days' },
    { label: 'Weeks',         value: `${sign}${(abs / 7).toFixed(2)}` },
    { label: 'Months (cal.)', value: String(months) },
    { label: 'Hours',         value: `${sign}${(abs * 24).toFixed(0)}` },
    { label: 'Minutes',       value: `${sign}${(abs * 1440).toFixed(0)}` },
  ];
}

const today = new Date().toISOString().slice(0, 10);
const nextWeek = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);

export default function DateCalculator() {
  return (
    <CalcTool
      toolId="calc-date"
      inputs={[
        { id: 'from', label: 'From', type: 'date', defaultValue: today },
        { id: 'to',   label: 'To',   type: 'date', defaultValue: nextWeek },
      ]}
      compute={compute}
    />
  );
}
