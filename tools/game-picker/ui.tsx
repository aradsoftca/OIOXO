'use client';
import * as React from 'react';
import { TextTool } from '@/components/tool/TextTool';

function shuffle<T>(arr: T[]): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
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
          Pick again
        </button>
      </div>
      <TextTool
        key={nonce}
        toolId="game-picker"
        colorVar="--color-cat-game"
        inputPlaceholder="One option per line…"
        transform={(input, o) => {
          const items = input.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
          if (items.length === 0) return 'Add at least one option above.';
          const mode = String(o.mode);
          if (mode === 'shuffle') return shuffle(items).join('\n');
          if (mode === 'teams') {
            const teams = Math.max(2, Math.min(20, Number(o.teamCount) || 2));
            const out: string[][] = Array.from({ length: teams }, () => []);
            shuffle(items).forEach((it, i) => out[i % teams].push(it));
            return out.map((t, i) => `── Team ${i + 1} ──\n${t.join('\n')}`).join('\n\n');
          }
          // pick N
          const n = Math.max(1, Math.min(items.length, Number(o.count) || 1));
          return shuffle(items).slice(0, n).map((p, i) => `${i + 1}. ${p}`).join('\n');
        }}
        controls={[
          {
            id: 'mode', label: 'Mode', type: 'select', defaultValue: 'pick',
            options: [
              { value: 'pick',    label: 'Pick N at random' },
              { value: 'shuffle', label: 'Shuffle list' },
              { value: 'teams',   label: 'Split into teams' },
            ],
          },
          { id: 'count',     label: 'Picks',    type: 'number', defaultValue: 1, min: 1, max: 50 },
          { id: 'teamCount', label: 'Teams',    type: 'number', defaultValue: 2, min: 2, max: 20 },
        ]}
      />
    </div>
  );
}
