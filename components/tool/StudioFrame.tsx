'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowLeft, Share2, Pin, ChevronDown } from 'lucide-react';
import type { ToolManifest } from '@/lib/registry/types';
import { CATEGORIES } from '@/lib/registry/types';
import { TileIcon } from '@/components/tiles/TileIcon';
import { togglePin, getPins } from '@/lib/storage/pins';
import { cn } from '@/lib/cn';

interface StudioFrameProps {
  tool: ToolManifest;
  /** The editor itself — fills the viewport below the slim bar. */
  children: React.ReactNode;
  /** Marketing / SEO content, shown in a normal scroll region BELOW the app. */
  about?: React.ReactNode;
}

/**
 * Full-viewport chrome for the heavy "studio" editors (video / image / pdf /
 * office / audio …). Unlike `ToolFrame`, the editor is NOT pushed down by a
 * marketing banner and SEO copy — it owns the screen the way a real desktop
 * editor (CapCut, Photopea) does. A slim top bar keeps identity, back, pin,
 * share and the usage meter one click away. The marketing/SEO `about` block
 * still renders (so crawlers and curious users get it) but lives in a separate
 * scroll region below the 100dvh app, reachable via the "About" affordance.
 */
export function StudioFrame({ tool, children, about }: StudioFrameProps) {
  const cat = CATEGORIES[tool.category];
  const [pinned, setPinned] = React.useState(false);

  React.useEffect(() => {
    setPinned(getPins().includes(tool.id));
    const onUpdate = () => setPinned(getPins().includes(tool.id));
    window.addEventListener('xonvert:pins-update', onUpdate);
    return () => window.removeEventListener('xonvert:pins-update', onUpdate);
  }, [tool.id]);

  // Pre-warm ffmpeg for video studios (same idle pre-warm ToolFrame does).
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

  const scrollToAbout = () => {
    document.getElementById('studio-about')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="studio-frame">
      {/* Break out of <main>'s centered max-w + padding so the editor is truly
          full-bleed, and sit exactly below the 56px sticky site header. This is
          self-contained — no changes to the global layout. */}
      <style>{`
        .studio-frame{
          width:100vw;
          margin-left:calc(50% - 50vw);
          /* cancel <main> top padding (py-6 / sm:py-10) so the app starts flush
             under the sticky header */
          margin-top:-1.5rem;
        }
        @media (min-width:640px){ .studio-frame{ margin-top:-2.5rem; } }
        .studio-frame .studio-app{ height:calc(100dvh - 56px); }
      `}</style>
      {/* The app: a full-viewport flex column. The slim bar is fixed-height,
          the editor takes the rest and is the only thing the user sees first. */}
      <div className="studio-app flex w-full flex-col overflow-hidden bg-[#0a0b0e]">
        {/* Slim top bar — dark, dense, editor-grade. NOT a marketing banner. */}
        <header
          className="flex h-11 shrink-0 items-center justify-between gap-2 border-b border-white/10 bg-[#0d0e12] px-2 text-white sm:px-3"
          style={{ ['--tile-color' as string]: `var(${cat.colorVar})` }}
        >
          <div className="flex min-w-0 items-center gap-1.5 sm:gap-2.5">
            <Link
              href="/"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-white/10 text-white/90 transition hover:bg-white/20"
              aria-label="Back to home"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <span
              className="hidden h-6 w-6 shrink-0 place-items-center rounded sm:grid"
              style={{ background: `var(${cat.colorVar})` }}
            >
              <TileIcon name={tool.icon} size={15} strokeWidth={2} />
            </span>
            <div className="flex min-w-0 items-center gap-2">
              <h1 className="truncate text-[13px] font-semibold tracking-tight sm:text-[15px]">
                {tool.name}
              </h1>
              <span
                className="hidden shrink-0 rounded px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-[0.18em] text-white/70 sm:inline"
                style={{ background: 'rgba(255,255,255,0.08)' }}
              >
                {cat.name}
              </span>
              {tool.compute === 'pro' && (
                <span className="hidden shrink-0 rounded bg-white/15 px-1.5 py-0.5 text-[9px] font-semibold sm:inline">
                  Pro option
                </span>
              )}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={scrollToAbout}
              className="hidden h-7 items-center gap-1 rounded px-2 text-[11px] font-medium text-white/60 transition hover:bg-white/10 hover:text-white/90 md:flex"
            >
              About <ChevronDown className="h-3 w-3" />
            </button>
            <button
              type="button"
              onClick={() => togglePin(tool.id)}
              aria-label={pinned ? 'Pinned' : 'Pin this tool'}
              className={cn(
                'flex h-7 items-center gap-1 rounded px-2 text-[11px] font-semibold transition',
                pinned ? 'bg-white text-black hover:bg-white/90' : 'bg-white/10 text-white/90 hover:bg-white/20',
              )}
            >
              <Pin className={cn('h-3.5 w-3.5', pinned && 'fill-current')} />
              <span className="hidden sm:inline">{pinned ? 'Pinned' : 'Pin'}</span>
            </button>
            <button
              type="button"
              className="flex h-7 w-7 items-center justify-center rounded bg-white/10 text-white/90 transition hover:bg-white/20"
              aria-label="Share this tool"
              onClick={() => {
                if (typeof navigator === 'undefined') return;
                const nav = navigator as Navigator & {
                  share?: (data: { url?: string; title?: string }) => Promise<void>;
                };
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
        </header>

        {/* Editor — owns the rest of the viewport. min-h-0 lets inner flex/scroll
            children size correctly inside the column. */}
        <div className="relative min-h-0 flex-1 overflow-hidden">
          {children}
        </div>
      </div>

      {/* Marketing / SEO — still present for crawlers and curious users, but
          below the fold so it never intrudes on the editor. */}
      {about && (
        <section id="studio-about" className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
          {about}
        </section>
      )}
    </div>
  );
}
