'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowLeft, Share2, Pin } from 'lucide-react';
import type { ToolManifest } from '@/lib/registry/types';
import { CATEGORIES } from '@/lib/registry/types';
import { TileIcon } from '@/components/tiles/TileIcon';
import { UsageMeter } from '@/components/usage/UsageMeter';
import { togglePin, getPins } from '@/lib/storage/pins';
import { cn } from '@/lib/cn';

interface ToolFrameProps {
  tool: ToolManifest;
  children: React.ReactNode;
}

/**
 * Tool-page chrome — feels like a "stretched-out tile" that morphs into
 * the page header. The category color flows down the page in a subtle
 * top-down gradient so the tool feels color-grounded.
 */
export function ToolFrame({ tool, children }: ToolFrameProps) {
  const cat = CATEGORIES[tool.category];
  const [pinned, setPinned] = React.useState(false);

  React.useEffect(() => {
    setPinned(getPins().includes(tool.id));
    const onUpdate = () => setPinned(getPins().includes(tool.id));
    window.addEventListener('xonvert:pins-update', onUpdate);
    return () => window.removeEventListener('xonvert:pins-update', onUpdate);
  }, [tool.id]);

  // Pre-warm ffmpeg for video tools: start downloading/compiling the heavy core
  // during idle time while the user picks options, so "Run" feels instant. Only
  // for `video` (always ffmpeg) — we avoid pulling 30 MB on audio/convert tools
  // that may use the lightweight Web Audio path instead.
  React.useEffect(() => {
    if (tool.category !== 'video') return;
    const w = window as Window & { requestIdleCallback?: (cb: () => void) => number };
    const kick = () => { void import('@/engines/ffmpeg').then((m) => m.warm()); };
    const id = w.requestIdleCallback ? w.requestIdleCallback(kick) : window.setTimeout(kick, 1200);
    return () => {
      const c = window as Window & { cancelIdleCallback?: (id: number) => void };
      if (c.cancelIdleCallback) c.cancelIdleCallback(id); else clearTimeout(id);
    };
  }, [tool.category]);

  return (
    <div className="relative space-y-6">
      {/* Category color "spill" — top-down soft gradient that grounds the tool */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -top-10 z-0 h-72 opacity-[0.22]"
        style={{
          background: `radial-gradient(ellipse 60% 80% at 50% 0%, var(${cat.colorVar}), transparent 70%)`,
        }}
      />

      {/* Header — flat solid color tile, sharp corners */}
      <header
        className="tile-surface relative z-10"
        style={{
          ['--tile-color' as string]: `var(${cat.colorVar})`,
          viewTransitionName: `tile-${tool.id}`,
        }}
      >
        <div className="tile-content !flex-row items-center !justify-between gap-2 py-4 sm:gap-4 sm:py-5">
          <div className="flex min-w-0 items-center gap-2.5 sm:gap-4">
            <Link
              href="/"
              className="flex h-9 w-9 shrink-0 items-center justify-center bg-white/15 text-white transition hover:bg-white/25"
              aria-label="Back"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div className="hidden h-12 w-12 shrink-0 place-items-center bg-white/15 text-white sm:grid">
              <TileIcon name={tool.icon} size={24} strokeWidth={1.75} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-[9px] font-bold uppercase tracking-[0.22em] text-white/80">
                <span className="section-dot" style={{ ['--dot-color' as string]: 'rgba(255,255,255,0.85)' }} />
                {cat.name}
                {tool.compute === 'pro' && (
                  <span className="bg-white/20 px-1.5 py-0.5 text-[9px]">Pro option</span>
                )}
              </div>
              <h1 className="mt-0.5 truncate text-[19px] font-semibold tracking-tight text-white sm:text-[26px]">
                {tool.name}
              </h1>
              <div className="mt-0.5 line-clamp-2 text-[12px] font-medium text-white/80 sm:line-clamp-1">{tool.blurb}</div>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => togglePin(tool.id)}
              aria-label={pinned ? 'Pinned' : 'Pin'}
              className={cn(
                'flex h-9 items-center gap-1.5 px-2.5 text-[12px] font-semibold transition sm:px-3',
                pinned
                  ? 'bg-white text-black hover:bg-white/90'
                  : 'bg-white/15 text-white hover:bg-white/25',
              )}
            >
              <Pin className={cn('h-3.5 w-3.5', pinned && 'fill-current')} />
              <span className="hidden sm:inline">{pinned ? 'Pinned' : 'Pin'}</span>
            </button>
            <button
              type="button"
              className="flex h-9 w-9 items-center justify-center bg-white/15 text-white transition hover:bg-white/25"
              aria-label="Share"
              onClick={() => {
                if (typeof navigator === 'undefined') return;
                const nav = navigator as Navigator & {
                  share?: (data: { url?: string; title?: string }) => Promise<void>;
                };
                // Both rejections are normal flows (user cancelled the
                // share sheet, clipboard permission denied) — swallow them.
                if (nav.share) {
                  nav.share({ url: window.location.href, title: tool.name }).catch(() => { /* */ });
                } else {
                  nav.clipboard?.writeText(window.location.href).catch(() => { /* */ });
                }
              }}
            >
              <Share2 className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      <div className="relative z-10">
        <UsageMeter category={tool.category} toolId={tool.id} />
        {children}
      </div>
    </div>
  );
}
