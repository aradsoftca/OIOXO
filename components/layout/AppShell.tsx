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
import { STUDIOS_DISABLED } from '@/lib/studios/disabled';
import { UsageGateProvider } from '@/components/usage/UsageGateProvider';
import { GlobalProgress } from './GlobalProgress';
import { NavProgress } from './NavProgress';
import { CATALOG } from '@/lib/catalog';
import { CATEGORIES } from '@/lib/registry/types';
import { BRAND, IS_OIOXO } from '@/lib/brand';
import { isFullscreenStudioPath } from '@/lib/studios/fullscreen';

interface AppShellProps {
  children: React.ReactNode;
}

const NAV_LINKS = [
  { href: '/', label: 'Home' },
  { href: '/convert', label: 'Convert' },
  { href: '/cad-3d', label: 'CAD & 3D' },
  { href: '/apps', label: 'Apps' },
  { href: '/studios', label: 'Studios' },
  { href: '/tools', label: 'All tools' },
  { href: '/pricing', label: 'Pricing' },
].filter((l) => !(STUDIOS_DISABLED && l.href === '/studios'));

// Pages where the AppsBar + ToolsBar strips stay always visible (top-level
// browse surfaces). Everywhere else is an "internal" page (an individual tool,
// app, studio, converter, etc.) where the strips collapse and only drop down
// when the user hovers the top nav.
function isMainPage(pathname: string): boolean {
  if (pathname === '/' || pathname === '/apps' || pathname === '/studios' || pathname === '/tools') return true;
  if (pathname === '/pricing' || pathname === '/account') return true;
  if (pathname.startsWith('/auth/')) return true;
  return false;
}

export function AppShell({ children }: AppShellProps) {
  const [paletteOpen, setPaletteOpen] = React.useState(false);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [navHover, setNavHover] = React.useState(false);
  const pathname = usePathname();
  const showStripsAlways = isMainPage(pathname);
  // Full app takeover: heavy studios own the whole viewport from y=0 like a
  // desktop editor. We hide the site header, browse strips and footer, and let
  // <main> go full-bleed (no max-width, no padding, full height) so the editor
  // is the only thing on screen. The marketing/SEO copy still renders BELOW the
  // editor (StudioFrame puts it in its own scroll region, reachable via About).
  const studioTakeover = isFullscreenStudioPath(pathname);

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
        {/*
         * Hover zone wraps BOTH the header and the strips so the cursor can
         * cross from one into the other without the strips closing mid-cross.
         * onMouseLeave only fires when the cursor exits the union of both,
         * which is exactly the gesture that should collapse the menu.
         */}
        <div
          onMouseEnter={() => setNavHover(true)}
          onMouseLeave={() => setNavHover(false)}
          className={studioTakeover ? 'hidden' : undefined}
        >
        <header
          className="sticky top-0 z-40 border-b border-[var(--color-stroke)] bg-[var(--color-canvas)]/80 backdrop-blur-xl"
        >
          <div className="mx-auto flex h-14 max-w-[1440px] items-center justify-between px-4 sm:px-6">
            <Link href="/" className="flex items-center transition hover:opacity-80">
              {IS_OIOXO ? (
                <span className="text-xl font-extrabold tracking-tight text-[var(--color-fg)]">{BRAND}</span>
              ) : (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src="/logo-header.webp" alt={BRAND} width={297} height={84} className="h-7 w-auto" />
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

        {/*
         * Apps + Tools strips. On main browse pages (home, /apps, /studios,
         * /tools, /pricing, /account, /auth/*) they sit always-visible right
         * under the header. On every other (internal) page they collapse to
         * zero height and only drop down when the user hovers anywhere in the
         * top nav zone — header OR the strips themselves, so moving the mouse
         * down through them doesn't trigger a snap-close. The grid-rows trick
         * gives a smooth, jank-free height animation without measuring DOM.
         */}
        <div
          className={`sticky top-14 z-30 hidden md:block ${
            showStripsAlways ? '' : 'overflow-hidden transition-[max-height,opacity] duration-300 ease-out'
          }`}
          // The collapsed strip MUST take zero height on internal pages. The old
          // grid-template-rows:0fr collapse was inert because `md:block` (the
          // mobile-hide variant) overrode the `grid` display, so the strip kept
          // its full ~174px height (only hidden via opacity) and pushed every
          // internal page's content down. max-height collapse works on the
          // block element directly: 0 when idle, a generous cap when hovered.
          // Inline style wins the cascade, so there's no utility-order fragility.
          style={
            showStripsAlways
              ? undefined
              : { maxHeight: navHover ? 240 : 0, opacity: navHover ? 1 : 0 }
          }
        >
          <div className={showStripsAlways ? '' : 'min-h-0 overflow-hidden'}>
            <AppsBar />
            <ToolsBar />
          </div>
        </div>
        </div>{/* /hover zone */}

        <main
          className={
            studioTakeover
              ? 'w-full' // full-bleed: the studio owns the viewport from y=0
              : 'mx-auto max-w-[1440px] px-4 py-6 sm:px-6 sm:py-10'
          }
        >
          {children}
        </main>

        <footer className={`border-t border-[var(--color-stroke)] py-8 ${studioTakeover ? 'hidden' : ''}`}>
          <div className="mx-auto flex max-w-[1440px] flex-col items-center justify-between gap-3 px-4 text-[12px] text-[var(--color-fg-subtle)] sm:px-6 md:flex-row">
            <div>{IS_OIOXO ? 'oioxo — all-in-one AI, on your device.' : 'Xonvert 2026 — every file. every tool.'}</div>
            <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-0">
              <Link href="/blog" className="inline-flex min-h-[44px] items-center px-1 transition hover:text-[var(--color-fg)]">Blog</Link>
              <Link href="/formats" className="inline-flex min-h-[44px] items-center px-1 transition hover:text-[var(--color-fg)]">Formats</Link>
              <Link href="/help" className="inline-flex min-h-[44px] items-center px-1 transition hover:text-[var(--color-fg)]">Help</Link>
              <Link href="/support" className="inline-flex min-h-[44px] items-center px-1 transition hover:text-[var(--color-fg)]">Support</Link>
              <Link href="/viewer" className="inline-flex min-h-[44px] items-center px-1 transition hover:text-[var(--color-fg)]">Viewer</Link>
              <Link href="/send" className="inline-flex min-h-[44px] items-center px-1 transition hover:text-[var(--color-fg)]">Send</Link>
              <Link href="/privacy" className="inline-flex min-h-[44px] items-center px-1 transition hover:text-[var(--color-fg)]">Privacy</Link>
              <Link href="/terms" className="inline-flex min-h-[44px] items-center px-1 transition hover:text-[var(--color-fg)]">Terms</Link>
              <Link href="/cookies" className="inline-flex min-h-[44px] items-center px-1 transition hover:text-[var(--color-fg)]">Cookies</Link>
              <Link href="/refund" className="inline-flex min-h-[44px] items-center px-1 transition hover:text-[var(--color-fg)]">Refund</Link>
              <Link href="/security" className="inline-flex min-h-[44px] items-center px-1 transition hover:text-[var(--color-fg)]">Security</Link>
              <Link href="/acceptable-use" className="inline-flex min-h-[44px] items-center px-1 transition hover:text-[var(--color-fg)]">Use policy</Link>
              <Link href="/dmca" className="inline-flex min-h-[44px] items-center px-1 transition hover:text-[var(--color-fg)]">DMCA</Link>
              <Link href="/subprocessors" className="inline-flex min-h-[44px] items-center px-1 transition hover:text-[var(--color-fg)]">Subprocessors</Link>
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
        className={`absolute right-0 top-0 flex h-full w-[84%] max-w-sm flex-col bg-[var(--color-canvas)] transition-transform duration-250 ease-out ${open ? 'translate-x-0 shadow-2xl' : 'translate-x-full invisible'}`}
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
