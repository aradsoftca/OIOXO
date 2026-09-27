'use client';

import * as React from 'react';
import { Shuffle } from 'lucide-react';
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

  // Enter (when not typing in a field) regenerates — fast "give me more" loop.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      e.preventDefault();
      setNonce((n) => n + 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end gap-3">
        <span className="text-[11px] uppercase tracking-[0.18em] text-[var(--color-fg-subtle)]">Press Enter to reroll</span>
        <button
          type="button"
          onClick={() => setNonce((n) => n + 1)}
          className="inline-flex items-center gap-1.5 border border-black/[0.08] bg-[var(--color-surface-1)] px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-[var(--color-fg)] transition hover:bg-[var(--color-surface-2)]"
        >
          <Shuffle className="h-3.5 w-3.5" /> Generate again
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
