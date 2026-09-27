'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowLeft, Share2 } from 'lucide-react';
import { TileIcon } from '@/components/tiles/TileIcon';
import type { ConvertPair } from '@/lib/convert/pairs';
import { pairTitle, pairBlurb } from '@/lib/convert/pairs';

interface Props {
  pair: ConvertPair;
  children: React.ReactNode;
}

/**
 * Convert-page chrome. Visually mirrors ToolFrame but leads with the
 * FROM → TO format pair instead of a tool name. The page sits under the
 * /convert color so the journey from hub → pair is color-continuous.
 */
export function ConvertFrame({ pair, children }: Props) {
  const colorVar = '--color-cat-convert';
  const title = pairTitle(pair);
  const blurb = pairBlurb(pair);

  return (
    <div className="relative space-y-6">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -top-10 z-0 h-72 opacity-[0.22]"
        style={{
          background: `radial-gradient(ellipse 60% 80% at 50% 0%, var(${colorVar}), transparent 70%)`,
        }}
      />

      <header
        className="tile-surface relative z-10"
        style={{ ['--tile-color' as string]: `var(${colorVar})` }}
      >
        <div className="tile-content !flex-row items-center !justify-between gap-4 py-5">
          <div className="flex items-center gap-4">
            <Link
              href="/convert"
              className="flex h-9 w-9 items-center justify-center bg-white/15 text-white transition hover:bg-white/25"
              aria-label="Back to convert hub"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div className="grid h-12 w-12 place-items-center bg-white/15 text-white">
              <TileIcon name="replace" size={24} strokeWidth={1.75} />
            </div>
            <div>
              <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.22em] text-white/80">
                <span className="section-dot" style={{ ['--dot-color' as string]: 'rgba(255,255,255,0.85)' }} />
                Convert
              </div>
              <h1 className="mt-0.5 flex items-baseline gap-2 text-[26px] font-semibold tracking-tight text-white">
                <span className="font-mono">{pair.from.toUpperCase()}</span>
                <span className="text-white/55">→</span>
                <span className="font-mono">{pair.to.toUpperCase()}</span>
              </h1>
              <div className="mt-0.5 max-w-xl text-[12px] font-medium text-white/80">{blurb}</div>
            </div>
          </div>

          <button
            type="button"
            className="flex h-9 w-9 items-center justify-center bg-white/15 text-white transition hover:bg-white/25"
            aria-label="Share"
            onClick={() => {
              if (typeof navigator === 'undefined') return;
              const nav = navigator as Navigator & { share?: (data: { url?: string; title?: string }) => Promise<void> };
              // Both Web Share and clipboard can reject (permission denied,
              // user cancelled the share sheet) — swallow so the UI doesn't
              // log an unhandled rejection in those normal flows.
              if (nav.share) nav.share({ url: window.location.href, title }).catch(() => { /* */ });
              else nav.clipboard?.writeText(window.location.href).catch(() => { /* */ });
            }}
          >
            <Share2 className="h-4 w-4" />
          </button>
        </div>
      </header>

      {pair.note && (
        <div className="border-l-2 border-[var(--color-cat-convert)] bg-[var(--color-surface-1)] px-4 py-3 text-[12px] text-[var(--color-fg-muted)]">
          {pair.note}
        </div>
      )}

      <div className="relative z-10">{children}</div>
    </div>
  );
}
