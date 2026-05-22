'use client';

import * as React from 'react';
import { TextTool } from '@/components/tool/TextTool';

interface Props {
  toolId: string;
  /** Pure generator — receives options (e.g. quantity) and returns one name. */
  generate: (opts: Record<string, unknown>) => string;
  /** Optional controls to expose beyond the count slider. */
  extraControls?: React.ComponentProps<typeof TextTool>['controls'];
  /** Default quantity. */
  defaultCount?: number;
}

/**
 * Thin wrapper around TextTool for "click-to-generate" name tools.
 * Adds a "Generate again" button that bumps a nonce, forcing the transform
 * to re-run and produce fresh names.
 */
export function NameGenerator({ toolId, generate, extraControls = [], defaultCount = 12 }: Props) {
  const [nonce, setNonce] = React.useState(0);
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setNonce((n) => n + 1)}
          className="border border-black/[0.08] bg-[var(--color-surface-1)] px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-[var(--color-fg)] transition hover:bg-[var(--color-surface-2)]"
        >
          Generate again
        </button>
      </div>
      <TextTool
        key={nonce}
        toolId={toolId}
        colorVar="--color-cat-game"
        initialInput=" "
        transform={(_, opts) => {
          const count = Math.max(1, Math.min(200, Number(opts.count) || defaultCount));
          return Array.from({ length: count }, () => generate(opts)).join('\n');
        }}
        controls={[
          { id: 'count', label: 'Quantity', type: 'number', defaultValue: defaultCount, min: 1, max: 200 },
          ...extraControls,
        ]}
      />
    </div>
  );
}
