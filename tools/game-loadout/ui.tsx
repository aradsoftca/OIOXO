'use client';
import * as React from 'react';
import { TextTool } from '@/components/tool/TextTool';

const EXAMPLE = `Primary: Assault Rifle, SMG, Shotgun, Sniper, LMG
Secondary: Pistol, Revolver, Machine Pistol
Tactical: Flashbang, Smoke, Stun
Lethal: Frag, Semtex, Throwing Knife
Perk: Double Time, Scavenger, Ghost, Hardline`;

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
          Randomize
        </button>
      </div>
      <TextTool
        key={nonce}
        toolId="game-loadout"
        colorVar="--color-cat-game"
        initialInput={EXAMPLE}
        inputPlaceholder={'One slot per line:\nSlot name: option a, option b, option c'}
        transform={(input) => {
          const lines = input.split('\n').map((l) => l.trim()).filter(Boolean);
          if (!lines.length) return 'Add slots like:  Primary: AK, M4, AWP';
          return lines.map((line) => {
            const idx = line.indexOf(':');
            const label = idx >= 0 ? line.slice(0, idx).trim() : 'Pick';
            const opts = (idx >= 0 ? line.slice(idx + 1) : line)
              .split(',').map((s) => s.trim()).filter(Boolean);
            if (!opts.length) return `${label}: (no options)`;
            const pick = opts[Math.floor(Math.random() * opts.length)];
            return `${label.padEnd(12)} → ${pick}`;
          }).join('\n');
        }}
      />
    </div>
  );
}
