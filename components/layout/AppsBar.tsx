'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { TileIcon } from '@/components/tiles/TileIcon';
import { visibleApps } from '@/lib/apps';
import { IS_OIOXO } from '@/lib/brand';
import { cn } from '@/lib/cn';

/**
 * AppsBar — a slim strip of the flagship apps (Send, Clipboard, Chat, …),
 * sitting directly above the ToolsBar in the header. Mirrors the ToolsBar
 * look so the two read as one navigation block.
 */
export function AppsBar() {
  const pathname = usePathname();
  const apps = visibleApps(IS_OIOXO);

  return (
    <div className="border-b border-[var(--color-stroke)] bg-[var(--color-canvas)]/92 backdrop-blur-xl">
      <div className="mx-auto max-w-[1440px] px-3">
        <div className="flex items-center gap-1 overflow-x-auto py-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <span className="mr-1 shrink-0 px-1 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--color-fg-subtle)]">
            Apps
          </span>
          {apps.map((a) => {
            const active = pathname === a.href;
            return (
              <Link
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
      </div>
    </div>
  );
}
