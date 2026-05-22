'use client';
import * as React from 'react';
import { TextTool } from '@/components/tool/TextTool';

const SETS = {
  lower: 'abcdefghijklmnopqrstuvwxyz',
  upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  digit: '0123456789',
  symbol: '!@#$%^&*()-_=+[]{};:,.<>?/',
  ambiguous: '0OoIl1|',
};

function generate(opts: Record<string, unknown>, nonce: number): string {
  void nonce;
  const len = Math.max(4, Math.min(256, Number(opts.length) || 16));
  const count = Math.max(1, Math.min(50, Number(opts.count) || 1));
  let charset = '';
  if (opts.lower)  charset += SETS.lower;
  if (opts.upper)  charset += SETS.upper;
  if (opts.digit)  charset += SETS.digit;
  if (opts.symbol) charset += SETS.symbol;
  if (!charset) charset = SETS.lower + SETS.upper + SETS.digit;
  if (opts.noAmbig) {
    const drop = new Set(SETS.ambiguous);
    charset = Array.from(charset).filter((c) => !drop.has(c)).join('');
  }
  const lines: string[] = [];
  const rand = new Uint32Array(len);
  for (let i = 0; i < count; i++) {
    crypto.getRandomValues(rand);
    let pw = '';
    for (let j = 0; j < len; j++) pw += charset[rand[j] % charset.length];
    lines.push(pw);
  }
  return lines.join('\n');
}

export default function Tool() {
  const [nonce, setNonce] = React.useState(0);
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setNonce((n) => n + 1)}
          className="border border-black/[0.08] bg-[var(--color-surface-1)] px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-[var(--color-fg)] transition hover:bg-[var(--color-surface-2)]"
        >
          Regenerate
        </button>
      </div>
      <TextTool
        key={nonce}
        toolId="dev-password"
        colorVar="--color-cat-dev"
        transform={(_, opts) => generate(opts, nonce)}
        initialInput=" "
        controls={[
          { id: 'length',   label: 'Length',          type: 'number', defaultValue: 20, min: 4, max: 256 },
          { id: 'count',    label: 'How many',        type: 'number', defaultValue: 1,  min: 1, max: 50 },
          { id: 'lower',    label: 'Lowercase a–z',   type: 'toggle', defaultValue: true },
          { id: 'upper',    label: 'Uppercase A–Z',   type: 'toggle', defaultValue: true },
          { id: 'digit',    label: 'Digits 0–9',      type: 'toggle', defaultValue: true },
          { id: 'symbol',   label: 'Symbols',         type: 'toggle', defaultValue: true },
          { id: 'noAmbig',  label: 'Avoid ambiguous chars (0/O, 1/l)', type: 'toggle', defaultValue: true },
        ]}
      />
    </div>
  );
}
