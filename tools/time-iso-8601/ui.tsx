'use client';
import { CalcTool, type CalcResult } from '@/components/tool/CalcTool';

function compute(v: Record<string, string | number>): CalcResult[] {
  const raw = String(v.input ?? '').trim();
  if (!raw) return [{ label: 'Enter a date', value: '—', primary: true }];
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return [{ label: 'Invalid date', value: '—', primary: true }];

  const iso = d.toISOString();
  const dateOnly = iso.slice(0, 10);
  const timeOnly = iso.slice(11, 19);
  const basic = iso.replace(/[-:]/g, '').replace('.000', '');
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, -1);
  const offset = -d.getTimezoneOffset();
  const offSign = offset >= 0 ? '+' : '-';
  const offH = Math.floor(Math.abs(offset) / 60).toString().padStart(2, '0');
  const offM = (Math.abs(offset) % 60).toString().padStart(2, '0');
  const localWithOffset = `${local}${offSign}${offH}:${offM}`;

  return [
    { label: 'Extended (UTC)', value: iso, primary: true },
    { label: 'Date only',      value: dateOnly },
    { label: 'Time only',      value: timeOnly },
    { label: 'Basic format',   value: basic },
    { label: 'Local with offset', value: localWithOffset },
    { label: 'Week date',      value: weekDate(d) },
    { label: 'Day of year',    value: String(dayOfYear(d)) + ' of ' + (isLeap(d.getFullYear()) ? '366' : '365') },
  ];
}

function dayOfYear(d: Date): number {
  const start = new Date(d.getFullYear(), 0, 1);
  return Math.floor((d.getTime() - start.getTime()) / 86_400_000) + 1;
}

function isLeap(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

function weekDate(d: Date): string {
  // ISO week date
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNr = (t.getUTCDay() + 6) % 7;
  t.setUTCDate(t.getUTCDate() - dayNr + 3);
  const firstThursday = new Date(Date.UTC(t.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((t.getTime() - firstThursday.getTime()) / 86_400_000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, '0')}-${dayNr + 1}`;
}

export default function Tool() {
  return (
    <CalcTool
      toolId="time-iso-8601"
      colorVar="--color-cat-time"
      inputs={[
        { id: 'input', label: 'Date / time', type: 'text', defaultValue: new Date().toISOString() },
      ]}
      compute={compute}
    />
  );
}
