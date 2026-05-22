'use client';
import * as React from 'react';
import { TextTool } from '@/components/tool/TextTool';

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
          Flip again
        </button>
      </div>
      <TextTool
        key={nonce}
        toolId="game-coin"
        colorVar="--color-cat-game"
        initialInput=" "
        transform={(_, o) => {
          const count = Math.max(1, Math.min(10000, Number(o.count) || 1));
          let heads = 0, tails = 0;
          const flips = Array.from({ length: count }, () => {
            const isHeads = Math.random() < 0.5;
            if (isHeads) heads++; else tails++;
            return isHeads ? 'HEADS' : 'tails';
          });
          if (count === 1) return flips[0];
          const histogram = `${'█'.repeat(Math.round((heads / count) * 30))}${'░'.repeat(30 - Math.round((heads / count) * 30))}`;
          return [
            `Heads: ${heads} (${((heads / count) * 100).toFixed(1)}%)`,
            `Tails: ${tails} (${((tails / count) * 100).toFixed(1)}%)`,
            histogram,
            '',
            count <= 200 ? flips.join('  ') : `(${count} flips)`,
          ].join('\n');
        }}
        controls={[
          { id: 'count', label: 'How many flips', type: 'number', defaultValue: 1, min: 1, max: 10000 },
        ]}
      />
    </div>
  );
}
