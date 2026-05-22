'use client';
import { CalcTool, type CalcResult } from '@/components/tool/CalcTool';

function compute(v: Record<string, string | number>): CalcResult[] {
  const raw = String(v.value ?? '').trim();
  const base = Number(v.base) || 10;
  if (!raw) return [{ label: 'Enter a number', value: '—', primary: true }];
  let n: number;
  try {
    n = parseInt(raw.replace(/^0[xob]/i, ''), base);
    if (!Number.isFinite(n) || Number.isNaN(n)) throw new Error('Invalid');
  } catch {
    return [{ label: 'Invalid number for base ' + base, value: '—', primary: true }];
  }
  return [
    { label: 'Decimal',     value: n.toString(10), primary: base !== 10 },
    { label: 'Hexadecimal', value: '0x' + n.toString(16).toUpperCase(), primary: base === 16 },
    { label: 'Binary',      value: '0b' + n.toString(2) },
    { label: 'Octal',       value: '0o' + n.toString(8) },
  ];
}

export default function HexCalculator() {
  return (
    <CalcTool
      toolId="calc-hex"
      inputs={[
        {
          id: 'base', label: 'Input base', type: 'select', defaultValue: '16',
          options: [
            { value: '2',  label: 'Binary (base 2)' },
            { value: '8',  label: 'Octal (base 8)' },
            { value: '10', label: 'Decimal (base 10)' },
            { value: '16', label: 'Hexadecimal (base 16)' },
          ],
        },
        { id: 'value', label: 'Value', type: 'text', defaultValue: 'FF' },
      ]}
      compute={compute}
    />
  );
}
