'use client';
import * as React from 'react';
import { TextTool } from '@/components/tool/TextTool';

function rollOnce(notation: string): { rolls: number[]; total: number; sides: number } {
  const m = /^(\d*)d(\d+)([+-]\d+)?$/i.exec(notation.trim());
  if (!m) throw new Error(`Bad notation: ${notation}`);
  const count = Math.max(1, Math.min(100, parseInt(m[1] || '1', 10)));
  const sides = Math.max(2, parseInt(m[2], 10));
  const mod   = m[3] ? parseInt(m[3], 10) : 0;
  const rolls: number[] = [];
  for (let i = 0; i < count; i++) rolls.push(1 + Math.floor(Math.random() * sides));
  return { rolls, total: rolls.reduce((a, b) => a + b, 0) + mod, sides };
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
          Roll again
        </button>
      </div>
      <TextTool
        key={nonce}
        toolId="game-dice"
        colorVar="--color-cat-game"
        initialInput=" "
        transform={(_, o) => {
          const lines = String(o.notation ?? '1d20').split(/[, \n]+/).map((s) => s.trim()).filter(Boolean);
          return lines.map((notation) => {
            try {
              const { rolls, total, sides } = rollOnce(notation);
              const annotated = rolls.map((r) =>
                r === sides ? `**${r}**` : r === 1 ? `(${r})` : String(r),
              ).join(' + ');
              return `${notation.padEnd(8)} → ${annotated}  = ${total}`;
            } catch (e) {
              return `${notation}: ${e instanceof Error ? e.message : String(e)}`;
            }
          }).join('\n');
        }}
        controls={[
          { id: 'notation', label: 'Dice (e.g. 4d6+2, comma-separate multiple)', type: 'text', defaultValue: '4d6 1d20 1d100' },
        ]}
      />
    </div>
  );
}
