'use client';
import * as React from 'react';
import { TextTool } from '@/components/tool/TextTool';
import { WEAPON_ADJ, WEAPONS, combine } from '@/engines/names';

const RARITIES: Array<{ name: string; weight: number; symbol: string }> = [
  { name: 'Common',    weight: 60, symbol: '◯' },
  { name: 'Uncommon',  weight: 25, symbol: '◐' },
  { name: 'Rare',      weight: 10, symbol: '◑' },
  { name: 'Epic',      weight: 4,  symbol: '◕' },
  { name: 'Legendary', weight: 1,  symbol: '★' },
];

function rollRarity(): typeof RARITIES[number] {
  const total = RARITIES.reduce((s, r) => s + r.weight, 0);
  let pick = Math.random() * total;
  for (const r of RARITIES) {
    pick -= r.weight;
    if (pick <= 0) return r;
  }
  return RARITIES[0];
}

function makeItem(): { item: string; rarity: typeof RARITIES[number] } {
  return {
    item: combine([WEAPON_ADJ, WEAPONS], ' '),
    rarity: rollRarity(),
  };
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
          Open another box
        </button>
      </div>
      <TextTool
        key={nonce}
        toolId="game-loot"
        colorVar="--color-cat-game"
        initialInput=" "
        transform={(_, o) => {
          const drops = Math.max(1, Math.min(20, Number(o.drops) || 5));
          const items = Array.from({ length: drops }, makeItem);
          const lines = items.map(({ item, rarity }) =>
            `${rarity.symbol}  ${rarity.name.padEnd(10)}  ${item}`,
          );
          const counts = new Map<string, number>();
          for (const it of items) counts.set(it.rarity.name, (counts.get(it.rarity.name) ?? 0) + 1);
          return [
            ...lines,
            '',
            '── Summary ──',
            ...Array.from(counts.entries()).map(([k, v]) => `${k}: ${v}`),
          ].join('\n');
        }}
        controls={[
          { id: 'drops', label: 'Drops per box', type: 'number', defaultValue: 5, min: 1, max: 20 },
        ]}
      />
    </div>
  );
}
