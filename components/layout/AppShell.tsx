'use client';

import * as React from 'react';
import Link from 'next/link';
import { TileIcon } from '@/components/tiles/TileIcon';
import { CommandPalette } from './CommandPalette';
import { DragMagicProvider } from './DragMagicProvider';
import { ToolsBar } from './ToolsBar';
import { HeaderAccount } from './HeaderAccount';
import { GlobalProgress } from './GlobalProgress';
import { NavProgress } from './NavProgress';

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const [paletteOpen, setPaletteOpen] = React.useState(false);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((s) => !s);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <DragMagicProvider>
      <React.Suspense fallback={null}><NavProgress /></React.Suspense>
      <GlobalProgress />
      <div className="app-stack min-h-screen">
        <header className="sticky top-0 z-40 border-b border-black/[0.04] bg-[oklch(97.5%_0.012_80/0.78)] backdrop-blur-xl">
          <div className="mx-auto flex h-14 max-w-[1440px] items-center justify-between px-6">
            <Link href="/" className="flex items-center transition hover:opacity-80">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.png" alt="Xonvert" className="h-7 w-auto" />
            </Link>

            <nav className="hidden items-center gap-6 text-[13px] font-medium text-[var(--color-fg-muted)] md:flex">
              <Link href="/" className="transition hover:text-[var(--color-fg)]">Home</Link>
              <Link href="/convert" className="transition hover:text-[var(--color-fg)]">Convert</Link>
              <Link href="/apps" className="transition hover:text-[var(--color-fg)]">Apps</Link>
              <Link href="/tools" className="transition hover:text-[var(--color-fg)]">All tools</Link>
              <Link href="/pricing" className="transition hover:text-[var(--color-fg)]">Pricing</Link>
            </nav>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPaletteOpen(true)}
                className="flex items-center gap-2 rounded-lg border border-black/[0.08] bg-white/60 px-3 py-1.5 text-[12px] text-[var(--color-fg-muted)] transition hover:bg-white hover:text-[var(--color-fg)]"
              >
                <TileIcon name="search" size={14} />
                <span className="hidden lg:inline">Search</span>
                <kbd className="ml-1 hidden rounded border border-black/10 bg-black/[0.04] px-1.5 py-0.5 font-mono text-[10px] lg:inline">
                  ⌘K
                </kbd>
              </button>
              <HeaderAccount />
            </div>
          </div>
        </header>

        <ToolsBar />

        <main className="mx-auto max-w-[1440px] px-6 py-10">{children}</main>

        <footer className="border-t border-black/[0.04] py-8">
          <div className="mx-auto flex max-w-[1440px] flex-col items-center justify-between gap-3 px-6 text-[12px] text-[var(--color-fg-subtle)] md:flex-row">
            <div>Xonvert 2026 — every file. every tool.</div>
            <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
              <Link href="/blog" className="transition hover:text-[var(--color-fg)]">Blog</Link>
              <Link href="/formats" className="transition hover:text-[var(--color-fg)]">Formats</Link>
              <Link href="/help" className="transition hover:text-[var(--color-fg)]">Help</Link>
              <Link href="/support" className="transition hover:text-[var(--color-fg)]">Support</Link>
              <Link href="/viewer" className="transition hover:text-[var(--color-fg)]">Viewer</Link>
              <Link href="/send" className="transition hover:text-[var(--color-fg)]">Send</Link>
              <Link href="/privacy" className="transition hover:text-[var(--color-fg)]">Privacy</Link>
              <Link href="/terms" className="transition hover:text-[var(--color-fg)]">Terms</Link>
              <Link href="/cookies" className="transition hover:text-[var(--color-fg)]">Cookies</Link>
              <Link href="/refund" className="transition hover:text-[var(--color-fg)]">Refund</Link>
              <span className="font-mono">v0.3</span>
            </div>
          </div>
        </footer>

        <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
      </div>
    </DragMagicProvider>
  );
}
