'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { TileIcon } from '@/components/tiles/TileIcon';
import { appsOnly, studiosOnly, type AppEntry } from '@/lib/apps';
import { IS_OIOXO } from '@/lib/brand';
import { cn } from '@/lib/cn';

/**
 * AppsBar — two slim strips above the ToolsBar: live/utility **Apps** (Send,
 * Chat, Call…) and creative **Studios** (Photo, Video, PDF, Sheets…). Splitting
 * them keeps each row readable and matches the /apps + /studios pages.
 */
export function AppsBar() {
  const pathname = usePathname();
  const apps = appsOnly(IS_OIOXO);
  const studios = studiosOnly(IS_OIOXO);
  // Defer path-derived active styling until after mount so server (prerendered
  // for a placeholder path) and first client render emit identical markup —
  // avoids a hydration mismatch on every /tools/* page.
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => { setMounted(true); }, []);
  const activePath = mounted ? pathname : '';

  return (
    <div className="border-b border-[var(--color-stroke)] bg-[var(--color-canvas)]/92 backdrop-blur-xl">
      <div className="mx-auto max-w-[1440px] px-3">
        <BarRow label="Apps" items={apps} pathname={activePath} />
        {studios.length > 0 && <div className="h-px bg-[var(--color-stroke)]/60" />}
        <BarRow label="Studios" items={studios} pathname={activePath} />
      </div>
    </div>
  );
}

function BarRow({ label, items, pathname }: { label: string; items: AppEntry[]; pathname: string }) {
  if (!items.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-1 gap-y-0.5 py-1.5">
      <span className="mr-1 w-[52px] shrink-0 self-center px-1 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--color-fg-subtle)]">
        {label}
      </span>
      {items.map((a) => {
        const active = pathname === a.href;
        return (
          <Link prefetch={false}
            key={a.href}
            href={a.href}
            className={cn(
              'group flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1 text-[12px] font-medium transition hover:bg-black/[0.04]',
              active ? 'text-[var(--color-fg)]' : 'text-[var(--color-fg-muted)]',
            )}
          >
            <span
              className="grid h-5 w-5 shrink-0 place-items-center text-white"
              style={{ background: `var(${a.colorVar})` }}
            >
              <TileIcon name={a.icon} size={12} strokeWidth={2} />
            </span>
            <span className="whitespace-nowrap">{a.short}</span>
          </Link>
        );
      })}
    </div>
  );
}
