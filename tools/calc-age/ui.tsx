'use client';

import { CalcTool, type CalcResult } from '@/components/tool/CalcTool';

function compute(values: Record<string, string | number>): CalcResult[] {
  const birth = String(values['birth'] ?? '');
  const onStr = String(values['on'] ?? '');
  if (!birth) return [];

  const b = new Date(birth);
  const o = onStr ? new Date(onStr) : new Date();
  if (Number.isNaN(b.getTime()) || Number.isNaN(o.getTime())) return [];
  if (o < b) return [{ label: 'Target date is before birth date', value: '—', primary: true }];

  let years = o.getFullYear() - b.getFullYear();
  let months = o.getMonth() - b.getMonth();
  let days = o.getDate() - b.getDate();
  if (days < 0) {
    months -= 1;
    const prev = new Date(o.getFullYear(), o.getMonth(), 0);
    days += prev.getDate();
  }
  if (months < 0) {
    years -= 1;
    months += 12;
  }

  const totalMs = o.getTime() - b.getTime();
  const totalDays = Math.floor(totalMs / (1000 * 60 * 60 * 24));
  const totalHours = Math.floor(totalMs / (1000 * 60 * 60));
  const totalMinutes = Math.floor(totalMs / (1000 * 60));
  const totalWeeks = Math.floor(totalDays / 7);

  return [
    { label: 'Age', value: `${years}y ${months}m ${days}d`, primary: true,
      hint: `as of ${o.toLocaleDateString()}` },
    { label: 'Total days', value: totalDays.toLocaleString() },
    { label: 'Total weeks', value: totalWeeks.toLocaleString() },
    { label: 'Total hours', value: totalHours.toLocaleString() },
    { label: 'Total minutes', value: totalMinutes.toLocaleString() },
  ];
}

const today = new Date().toISOString().slice(0, 10);

export default function AgeCalculator() {
  return (
    <CalcTool
      toolId="calc-age"
      colorVar="--color-cat-calc"
      inputs={[
        { id: 'birth', label: 'Date of birth', type: 'date', defaultValue: '2000-01-01' },
        { id: 'on', label: 'As of', type: 'date', defaultValue: today },
      ]}
      compute={compute}
    />
  );
}
