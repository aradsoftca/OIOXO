'use client';
/**
 * Per-tool usage meter: tells a free user EXACTLY what the daily limit is for this
 * category, how many free exports are left today, and what Pro unlocks — shown on
 * every tool via ToolFrame. Ungated tools (calculators, text, generators…) show
 * nothing (truly unlimited). Pro sessions show a quiet "unlimited" confirmation.
 */
import * as React from 'react';
import Link from 'next/link';
import { Crown } from 'lucide-react';
import type { Category } from '@/lib/registry/types';
import { gateKeyForTool, gateMetaForKey } from '@/lib/usage/config';
import { benefitsForKey, freeSizeLabel } from '@/lib/usage/benefits';
import { isInApp } from '@/lib/app-bridge';

interface Status { used: number; limit: number; unlimited?: boolean }

export function UsageMeter({ category, toolId }: { category: Category; toolId?: string }) {
  const [s, setS] = React.useState<Status | null>(null);
  // The gate key may be the category OR a per-tool id (value studios in an
  // otherwise-free category), so the meter matches exactly what is charged.
  const key = gateKeyForTool(toolId, category);

  React.useEffect(() => {
    if (!key) return;
    let on = true;
    fetch('/api/usage', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ category: key, action: 'status' }),
    })
      .then((r) => r.json())
      .then((d) => { if (on) setS({ used: d.used ?? 0, limit: d.limit ?? 1, unlimited: !!d.unlimited }); })
      .catch(() => {});
    return () => { on = false; };
  }, [key]);

  if (!key || !s) return null;

  const meta = gateMetaForKey(key);
  const color = `var(${meta.colorVar})`;
  const name = meta.name.toLowerCase();

  // Pro (or any unlimited session) — quiet confirmation, no upsell.
  if (s.unlimited) {
    return (
      <div className="mb-4 flex items-center gap-2 border-l-2 px-3 py-1.5 text-[12px] text-[var(--color-fg-muted)]"
        style={{ borderColor: color, background: 'var(--color-surface-1)' }}>
        <Crown className="h-3.5 w-3.5" style={{ color }} />
        <span>Pro — unlimited {name} exports, no waits, no watermark.</span>
      </div>
    );
  }

  // Mobile app: no daily limits there (an ad before an export instead), so no count to show.
  if (isInApp()) return null;

  const remaining = Math.max(0, s.limit - s.used);
  const topBenefit = benefitsForKey(key)[0];
  // The size cap only applies on true category keys (per-tool studios are count-only).
  const sizeLabel = key === category ? freeSizeLabel(category) : null;

  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-l-2 px-3 py-2 text-[12px]"
      style={{ borderColor: color, background: 'var(--color-surface-1)' }}>
      <span className="text-[var(--color-fg-muted)]">
        {remaining > 0 ? (
          <><strong className="text-[var(--color-fg)]">{remaining} of {s.limit}</strong> free {name} export{s.limit === 1 ? '' : 's'} left today</>
        ) : (
          <><strong className="text-[var(--color-fg)]">Free {name} limit reached</strong> — a short wait unlocks one more</>
        )}
        {/* The second gate: free input-size cap. */}
        {sizeLabel && <span className="text-[var(--color-fg-subtle)]"> · {sizeLabel}</span>}
        <span className="text-[var(--color-fg-subtle)]"> · resets midnight UTC · <Link href="/limits" className="underline underline-offset-2 hover:text-[var(--color-fg)]">all limits</Link></span>
      </span>
      <Link href="/pricing" className="flex items-center gap-1 font-bold uppercase tracking-wider transition hover:brightness-110" style={{ color }}>
        <Crown className="h-3 w-3" /> {topBenefit?.replace(/ —.*$/, '') || 'Go Pro'}
      </Link>
    </div>
  );
}
