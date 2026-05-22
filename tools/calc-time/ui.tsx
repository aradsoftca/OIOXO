'use client';
import { CalcTool, type CalcResult } from '@/components/tool/CalcTool';

function toSeconds(h: number, m: number, s: number): number {
  return h * 3600 + m * 60 + s;
}

function fmtHms(totalSec: number): string {
  const sign = totalSec < 0 ? '−' : '';
  const t = Math.abs(totalSec);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = Math.floor(t % 60);
  return `${sign}${h}h ${m}m ${s}s`;
}

function compute(v: Record<string, string | number>): CalcResult[] {
  const a = toSeconds(Number(v.h1) || 0, Number(v.m1) || 0, Number(v.s1) || 0);
  const b = toSeconds(Number(v.h2) || 0, Number(v.m2) || 0, Number(v.s2) || 0);
  const op = String(v.op);
  const result = op === '-' ? a - b : a + b;
  return [
    { label: 'Result',      value: fmtHms(result), primary: true },
    { label: 'Seconds',     value: String(result) },
    { label: 'Minutes',     value: (result / 60).toFixed(2) },
    { label: 'Hours',       value: (result / 3600).toFixed(4) },
  ];
}

export default function TimeCalculator() {
  return (
    <CalcTool
      toolId="calc-time"
      inputs={[
        { id: 'h1', label: 'A — hours',   defaultValue: 1 },
        { id: 'm1', label: 'A — minutes', defaultValue: 30 },
        { id: 's1', label: 'A — seconds', defaultValue: 0 },
        {
          id: 'op', label: 'Operation', type: 'select', defaultValue: '+',
          options: [
            { value: '+', label: 'Add (A + B)' },
            { value: '-', label: 'Subtract (A − B)' },
          ],
        },
        { id: 'h2', label: 'B — hours',   defaultValue: 0 },
        { id: 'm2', label: 'B — minutes', defaultValue: 45 },
        { id: 's2', label: 'B — seconds', defaultValue: 0 },
      ]}
      compute={compute}
    />
  );
}
