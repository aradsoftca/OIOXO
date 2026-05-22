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
          Simulate again
        </button>
      </div>
      <TextTool
        key={nonce}
        toolId="game-gacha"
        colorVar="--color-cat-game"
        initialInput=" "
        transform={(_, o) => {
          const rate = Math.max(0.01, Math.min(100, parseFloat(String(o.rate ?? '1')) || 1)) / 100;
          const pity = Math.max(0, parseInt(String(o.pity ?? '0'), 10) || 0);
          const pulls = Math.max(1, Math.min(100000, parseInt(String(o.pulls ?? '100'), 10) || 100));
          let hits = 0, sincePity = 0, dry = 0, maxDry = 0;
          const hitAt: number[] = [];
          for (let i = 1; i <= pulls; i++) {
            sincePity++; dry++;
            let hit = Math.random() < rate;
            if (pity > 0 && sincePity >= pity) hit = true; // guaranteed at pity
            if (hit) { hits++; hitAt.push(i); if (dry > maxDry) maxDry = dry; dry = 0; sincePity = 0; }
          }
          if (dry > maxDry) maxDry = dry;
          return [
            `Pulls:         ${pulls}`,
            `Base rate:     ${(rate * 100).toFixed(2)}%${pity ? `   (pity at ${pity})` : ''}`,
            `Hits:          ${hits}`,
            `Effective:     ${(hits / pulls * 100).toFixed(2)}%`,
            `Longest dry:   ${maxDry} pulls`,
            ``,
            `Hit on pulls:  ${hitAt.slice(0, 60).join(', ')}${hitAt.length > 60 ? ' …' : ''}`,
          ].join('\n');
        }}
        controls={[
          { id: 'rate', label: 'Rate % per pull', type: 'text', defaultValue: '1' },
          { id: 'pity', label: 'Pity — guaranteed at (0 = off)', type: 'text', defaultValue: '90' },
          { id: 'pulls', label: 'Number of pulls', type: 'text', defaultValue: '100' },
        ]}
      />
    </div>
  );
}
