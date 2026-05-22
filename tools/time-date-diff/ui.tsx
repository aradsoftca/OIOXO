'use client';
import { CalcTool, type CalcResult } from '@/components/tool/CalcTool';

function compute(v: Record<string, string | number>): CalcResult[] {
  const a = new Date(String(v.from));
  const b = new Date(String(v.to));
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) {
    return [{ label: 'Enter valid dates', value: '—', primary: true }];
  }
  const ms = b.getTime() - a.getTime();
  const totalDays = Math.round(ms / 86_400_000);
  // Workday + weekend count
  let work = 0, weekend = 0;
  const start = new Date(Math.min(a.getTime(), b.getTime()));
  const end   = new Date(Math.max(a.getTime(), b.getTime()));
  const cur = new Date(start);
  while (cur < end) {
    const day = cur.getDay();
    if (day === 0 || day === 6) weekend++; else work++;
    cur.setDate(cur.getDate() + 1);
  }
  // Years, months, days breakdown
  let years = b.getFullYear() - a.getFullYear();
  let months = b.getMonth() - a.getMonth();
  let days = b.getDate() - a.getDate();
  if (days < 0) { months--; days += new Date(b.getFullYear(), b.getMonth(), 0).getDate(); }
  if (months < 0) { years--; months += 12; }

  return [
    { label: 'Total days',  value: String(totalDays), primary: true },
    { label: 'Workdays',    value: String(work), hint: 'Mon–Fri only' },
    { label: 'Weekend days',value: String(weekend) },
    { label: 'Weeks',       value: (Math.abs(totalDays) / 7).toFixed(2) },
    { label: 'Y · M · D',   value: `${years}y ${months}m ${days}d` },
  ];
}

const today = new Date().toISOString().slice(0, 10);
const future = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);

export default function Tool() {
  return (
    <CalcTool
      toolId="time-date-diff"
      colorVar="--color-cat-time"
      inputs={[
        { id: 'from', label: 'From', type: 'date', defaultValue: today },
        { id: 'to',   label: 'To',   type: 'date', defaultValue: future },
      ]}
      compute={compute}
    />
  );
}
