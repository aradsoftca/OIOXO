'use client';
import { CalcTool, type CalcResult } from '@/components/tool/CalcTool';

function parseBin(s: string): number {
  return parseInt(String(s).replace(/^0b/i, ''), 2);
}

function compute(v: Record<string, string | number>): CalcResult[] {
  const a = parseBin(String(v.a ?? ''));
  const b = parseBin(String(v.b ?? ''));
  const op = String(v.op);
  if (!Number.isFinite(a) || (op !== 'NOT' && !Number.isFinite(b))) {
    return [{ label: 'Enter binary numbers', value: '—', primary: true, hint: 'e.g. 1010, 1100' }];
  }
  let r: number;
  switch (op) {
    case '+':   r = a + b; break;
    case '-':   r = a - b; break;
    case 'AND': r = a & b; break;
    case 'OR':  r = a | b; break;
    case 'XOR': r = a ^ b; break;
    case '<<':  r = a << b; break;
    case '>>':  r = a >>> b; break;
    case 'NOT': r = ~a; break;
    default:    r = 0;
  }
  return [
    { label: 'Binary',      value: r >= 0 ? r.toString(2) : '-' + Math.abs(r).toString(2), primary: true },
    { label: 'Decimal',     value: r.toString(10) },
    { label: 'Hexadecimal', value: '0x' + (r >>> 0).toString(16).toUpperCase() },
  ];
}

export default function BinaryCalculator() {
  return (
    <CalcTool
      toolId="calc-binary"
      inputs={[
        { id: 'a', label: 'A (binary)', type: 'text', defaultValue: '1010' },
        {
          id: 'op', label: 'Operation', type: 'select', defaultValue: '+',
          options: [
            { value: '+',   label: 'Add  (A + B)' },
            { value: '-',   label: 'Subtract  (A − B)' },
            { value: 'AND', label: 'Bitwise AND  (A & B)' },
            { value: 'OR',  label: 'Bitwise OR  (A | B)' },
            { value: 'XOR', label: 'Bitwise XOR  (A ⊕ B)' },
            { value: '<<',  label: 'Left shift  (A << B)' },
            { value: '>>',  label: 'Right shift  (A >> B)' },
            { value: 'NOT', label: 'NOT  (~A)' },
          ],
        },
        { id: 'b', label: 'B (binary)', type: 'text', defaultValue: '11' },
      ]}
      compute={compute}
    />
  );
}
