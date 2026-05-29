'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, X } from 'lucide-react';
import { TileIcon } from '@/components/tiles/TileIcon';
import { CommandPalette } from './CommandPalette';
import { DragMagicProvider } from './DragMagicProvider';
import { ToolsBar } from './ToolsBar';
import { AppsBar } from './AppsBar';
import { HeaderAccount } from './HeaderAccount';
import { UsageGateProvider } from '@/components/usage/UsageGateProvider';
import { GlobalProgress } from './GlobalProgress';
import { NavProgress } from './NavProgress';
import { CATALOG } from '@/lib/catalog';
import { CATEGORIES } from '@/lib/registry/types';
import { BRAND, IS_OIOXO } from '@/lib/brand';

interface AppShellProps {
  children: React.ReactNode;
}

const NAV_LINKS = [
  { href: '/', label: 'Home' },
  { href: '/convert', label: 'Convert' },
  { href: '/apps', label: 'Apps' },
  { href: '/studios', label: 'Studios' },
  { href: '/tools', label: 'All tools' },
  { href: '/pricing', label: 'Pricing' },
];

export function AppShell({ children }: AppShellProps) {
  const [paletteOpen, setPaletteOpen] = React.useState(false);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const pathname = usePathname();

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((s) => !s);
      }
      if (e.key === 'Escape') setMenuOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Close the mobile drawer whenever the route changes.
  React.useEffect(() => { setMenuOpen(false); }, [pathname]);

  // Lock body scroll while the drawer is open.
  React.useEffect(() => {
    if (!menuOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [menuOpen]);

  return (
    <DragMagicProvider>
      <React.Suspense fallback={null}><NavProgress /></React.Suspense>
      <GlobalProgress />
      <div className="app-stack min-h-screen">
        <header className="sticky top-0 z-40 border-b border-[var(--color-stroke)] bg-[var(--color-canvas)]/80 backdrop-blur-xl">
          <div className="mx-auto flex h-14 max-w-[1440px] items-center justify-between px-4 sm:px-6">
            <Link href="/" className="flex items-center transition hover:opacity-80">
              {IS_OIOXO ? (
                <span className="text-xl font-extrabold tracking-tight text-[var(--color-fg)]">{BRAND}</span>
              ) : (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src="/logo.png" alt={BRAND} className="h-7 w-auto" />
              )}
            </Link>

            <nav className="hidden items-center gap-6 text-[13px] font-medium text-[var(--color-fg-muted)] md:flex">
              {NAV_LINKS.map((l) => (
                <Link key={l.href} href={l.href} className="transition hover:text-[var(--color-fg)]">{l.label}</Link>
              ))}
            </nav>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPaletteOpen(true)}
                aria-label="Search"
                className="flex items-center gap-2 rounded-lg border border-[var(--color-stroke)] bg-[var(--color-surface-2)] px-2.5 py-1.5 text-[12px] text-[var(--color-fg-muted)] transition hover:bg-[var(--color-surface-3)] hover:text-[var(--color-fg)] sm:px-3"
              >
                <TileIcon name="search" size={14} />
                <span className="hidden lg:inline">Search</span>
                <kbd className="ml-1 hidden rounded border border-[var(--color-stroke)] bg-[var(--color-surface-3)] px-1.5 py-0.5 font-mono text-[10px] lg:inline">
                  ⌘K
                </kbd>
              </button>
              <HeaderAccount />
              {/* Mobile menu trigger — replaces the desktop nav + ToolsBar on phones */}
              <button
                type="button"
                onClick={() => setMenuOpen(true)}
                aria-label="Open menu"
                aria-expanded={menuOpen}
                className="grid h-9 w-9 place-items-center rounded-lg border border-[var(--color-stroke)] bg-[var(--color-surface-2)] text-[var(--color-fg-muted)] transition hover:bg-[var(--color-surface-3)] hover:text-[var(--color-fg)] md:hidden"
              >
                <Menu className="h-5 w-5" />
              </button>
            </div>
          </div>
        </header>

        {/* Apps row sits directly above the tools row; the two pin together. */}
        <div className="sticky top-14 z-30 hidden md:block">
          <AppsBar />
          <ToolsBar />
        </div>

        <main className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6 sm:py-10">{children}</main>

        <footer className="border-t border-[var(--color-stroke)] py-8">
          <div className="mx-auto flex max-w-[1440px] flex-col items-center justify-between gap-3 px-4 text-[12px] text-[var(--color-fg-subtle)] sm:px-6 md:flex-row">
            <div>{IS_OIOXO ? 'oioxo — all-in-one AI, on your device.' : 'Xonvert 2026 — every file. every tool.'}</div>
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
              <Link href="/security" className="transition hover:text-[var(--color-fg)]">Security</Link>
              <Link href="/acceptable-use" className="transition hover:text-[var(--color-fg)]">Use policy</Link>
              <Link href="/dmca" className="transition hover:text-[var(--color-fg)]">DMCA</Link>
              <Link href="/subprocessors" className="transition hover:text-[var(--color-fg)]">Subprocessors</Link>
              <span className="font-mono">v0.3</span>
            </div>
          </div>
        </footer>

        <UsageGateProvider />
        <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
        <MobileMenu open={menuOpen} onClose={() => setMenuOpen(false)} />
      </div>
    </DragMagicProvider>
  );
}

/** Slide-in mobile navigation drawer: primary links + every tool category. */
function MobileMenu({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <div
      className={`fixed inset-0 z-50 md:hidden ${open ? '' : 'pointer-events-none'}`}
      aria-hidden={!open}
    >
      {/* Backdrop */}
      <div
        onClick={onClose}
        className={`absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity duration-200 ${open ? 'opacity-100' : 'opacity-0'}`}
      />
      {/* Panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
        className={`absolute right-0 top-0 flex h-full w-[84%] max-w-sm flex-col bg-[var(--color-canvas)] shadow-2xl transition-transform duration-250 ease-out ${open ? 'translate-x-0' : 'translate-x-full'}`}
      >
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-[var(--color-stroke)] px-4">
          <span className="text-[13px] font-bold uppercase tracking-[0.18em] text-[var(--color-fg-muted)]">Menu</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="grid h-9 w-9 place-items-center rounded-lg text-[var(--color-fg-muted)] transition hover:bg-[var(--color-surface-2)] hover:text-[var(--color-fg)]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain px-3 py-3">
          <nav className="flex flex-col">
            {NAV_LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={onClose}
                className="rounded-lg px-3 py-2.5 text-[15px] font-semibold text-[var(--color-fg)] transition hover:bg-[var(--color-surface-2)]"
              >
                {l.label}
              </Link>
            ))}
          </nav>

          <div className="mt-4 mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--color-fg-subtle)]">
            Categories
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {CATALOG.map((cat) => {
              const meta = CATEGORIES[cat.id];
              return (
                <Link
                  key={cat.id}
                  href={`/tools?cat=${cat.id}`}
                  onClick={onClose}
                  className="flex items-center gap-2.5 rounded-lg border border-[var(--color-stroke)] bg-[var(--color-surface-1)] px-2.5 py-2 transition hover:bg-[var(--color-surface-2)]"
                >
                  <span
                    className="grid h-7 w-7 shrink-0 place-items-center text-white"
                    style={{ background: `var(${meta.colorVar})` }}
                  >
                    <TileIcon name={cat.icon} size={14} strokeWidth={2} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12.5px] font-medium text-[var(--color-fg)]">{cat.label}</span>
                  </span>
                  <span className="shrink-0 font-mono text-[10px] tabular-nums text-[var(--color-fg-subtle)]">{cat.tools.length}</span>
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
