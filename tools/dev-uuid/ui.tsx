'use client';

import * as React from 'react';
import { TextTool } from '@/components/tool/TextTool';

function uuidv4(): string {
  return crypto.randomUUID();
}

function uuidv7(): string {
  // UUIDv7: 48-bit unix-ms timestamp + version + rand
  const ts = BigInt(Date.now());
  const rand = crypto.getRandomValues(new Uint8Array(10));
  // assemble 16 bytes
  const b = new Uint8Array(16);
  b[0] = Number((ts >> 40n) & 0xffn);
  b[1] = Number((ts >> 32n) & 0xffn);
  b[2] = Number((ts >> 24n) & 0xffn);
  b[3] = Number((ts >> 16n) & 0xffn);
  b[4] = Number((ts >> 8n) & 0xffn);
  b[5] = Number(ts & 0xffn);
  b.set(rand, 6);
  b[6] = (b[6] & 0x0f) | 0x70; // version 7
  b[8] = (b[8] & 0x3f) | 0x80; // variant
  const hex = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function generate(_: string, options: Record<string, unknown>): string {
  const version = String(options['version'] ?? 'v4');
  const count = Math.max(1, Math.min(1000, Number(options['count'] ?? 10)));
  const upper = Boolean(options['upper']);
  const fn = version === 'v7' ? uuidv7 : uuidv4;
  const lines: string[] = [];
  for (let i = 0; i < count; i++) lines.push(upper ? fn().toUpperCase() : fn());
  return lines.join('\n');
}

export default function UuidTool() {
  // We pass a no-op input string so the TextTool re-renders on options change.
  // Regenerate button forces a new transform run with a fresh nonce.
  const [nonce, setNonce] = React.useState(0);
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setNonce((n) => n + 1)}
          className="border border-black/[0.08] bg-[var(--color-surface-1)] px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-[var(--color-fg)] transition hover:bg-[var(--color-surface-2)]"
        >
          Generate
        </button>
      </div>
      <TextTool
        key={nonce}
        toolId="dev-uuid"
        transform={generate}
        colorVar="--color-cat-dev"
        controls={[
          {
            id: 'version',
            label: 'UUID version',
            type: 'select',
            defaultValue: 'v4',
            options: [
              { value: 'v4', label: 'v4 (random)' },
              { value: 'v7', label: 'v7 (time-ordered)' },
            ],
          },
          { id: 'count', label: 'Quantity', type: 'number', defaultValue: 10, min: 1, max: 1000 },
          { id: 'upper', label: 'Uppercase', type: 'toggle', defaultValue: false },
        ]}
        initialInput=" "
      />
    </div>
  );
}
