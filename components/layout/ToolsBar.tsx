'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { createPortal } from 'react-dom';
import { CATALOG, isToolLive, toolHref, type CatalogCategory, type CatalogTool } from '@/lib/catalog';
import { CATEGORIES } from '@/lib/registry/types';
import { TileIcon } from '@/components/tiles/TileIcon';
import { cn } from '@/lib/cn';

/**
 * ToolsBar — the persistent navigation strip below the header.
 * One sharp colored cube per category. Hover opens a mega-dropdown that
 * lists every tool in that category (live + planned).
 *
 * Inspired by the old xonvert ToolsBar that the user missed. Carries the
 * same "all tools, one click" promise into the new design.
 */
export function ToolsBar() {
  const pathname = usePathname();
  const [mounted, setMounted] = React.useState(false);
  const [openIdx, setOpenIdx] = React.useState<number | null>(null);
  const [dropPos, setDropPos] = React.useState<{ top: number; left: number; width: number } | null>(null);
  const tileRefs = React.useRef<(HTMLAnchorElement | null)[]>([]);
  const closeTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => { setMounted(true); }, []);

  const dropdownWidth = React.useCallback((cat: CatalogCategory) => {
    const n = cat.tools.length;
    if (n >= 30) return 720;
    if (n >= 12) return 560;
    if (n >=  6) return 360;
    return 240;
  }, []);

  const openAt = React.useCallback((i: number) => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    const tile = tileRefs.current[i];
    if (!tile) return;
    const cat = CATALOG[i];
    const w = dropdownWidth(cat);
    const r = tile.getBoundingClientRect();
    const rawLeft = r.left + window.scrollX;
    const maxLeft = window.innerWidth + window.scrollX - w - 16;
    setDropPos({
      top: r.bottom + window.scrollY + 4,
      left: Math.max(8, Math.min(rawLeft, maxLeft)),
      width: w,
    });
    setOpenIdx(i);
  }, [dropdownWidth]);

  const scheduleClose = React.useCallback(() => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => {
      setOpenIdx(null);
      setDropPos(null);
    }, 140);
  }, []);

  const stay = React.useCallback(() => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  }, []);

  const active = openIdx !== null ? CATALOG[openIdx] : null;

  // Close on ESC
  React.useEffect(() => {
    if (openIdx === null) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpenIdx(null); setDropPos(null); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openIdx]);

  return (
    <div className="hidden border-b border-[var(--color-stroke)] bg-[var(--color-canvas)]/92 backdrop-blur-xl md:block">
      <div className="mx-auto max-w-[1440px] px-3">
        {/* Uniform grid: every category the same width, wraps to as many rows as
            needed so none are ever hidden. */}
        <div className="grid gap-1 py-2 [grid-template-columns:repeat(auto-fill,minmax(116px,1fr))]">
          {CATALOG.map((cat, i) => {
            const meta = CATEGORIES[cat.id];
            // Path-derived active state is gated on `mounted` so the server and
            // first client render emit identical markup. Otherwise the prerendered
            // HTML (built for a placeholder path) and the client (real path) disagree
            // on whether to render the active underline → hydration mismatch on every
            // /tools/* page. `openIdx` is user-interaction state (always null on first
            // paint) so it's safe to read pre-mount.
            const isActive = (mounted && pathname.startsWith(`/tools/${cat.id}-`)) || (openIdx === i);
            return (
              <div
                key={cat.id}
                onMouseEnter={() => openAt(i)}
                onMouseLeave={scheduleClose}
                className="relative"
              >
                <Link
                  href={`/tools?cat=${cat.id}`}
                  ref={(el) => { tileRefs.current[i] = el; }}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-[12px] font-medium transition',
                    'hover:bg-black/[0.04]',
                    isActive ? 'text-[var(--color-fg)]' : 'text-[var(--color-fg-muted)]',
                  )}
                  onFocus={() => openAt(i)}
                >
                  <span
                    className="grid h-6 w-6 shrink-0 place-items-center text-white transition-transform group-hover:scale-110"
                    style={{
                      background: `var(${meta.colorVar})`,
                      transform: openIdx === i ? 'translateY(-1px)' : undefined,
                    }}
                  >
                    <TileIcon name={cat.icon} size={13} strokeWidth={2} />
                  </span>
                  <span className="min-w-0 truncate">{cat.label}</span>
                  <span className="ml-auto text-[10px] font-mono text-[var(--color-fg-subtle)] tabular-nums">
                    {cat.tools.length}
                  </span>
                  {/* active underline */}
                  {isActive && (
                    <span
                      className="absolute bottom-0 left-1/2 h-[2px] w-6 -translate-x-1/2"
                      style={{ background: `var(${meta.colorVar})` }}
                    />
                  )}
                </Link>
              </div>
            );
          })}
        </div>
      </div>

      {/* Portal dropdown */}
      {mounted && active && openIdx !== null && dropPos && createPortal(
        <Dropdown
          category={active}
          dropPos={dropPos}
          onStay={stay}
          onClose={scheduleClose}
          onItemClick={() => { setOpenIdx(null); setDropPos(null); }}
        />,
        document.body,
      )}
    </div>
  );
}

interface DropdownProps {
  category: CatalogCategory;
  dropPos: { top: number; left: number; width: number };
  onStay: () => void;
  onClose: () => void;
  onItemClick: () => void;
}

function Dropdown({ category, dropPos, onStay, onClose, onItemClick }: DropdownProps) {
  const meta = CATEGORIES[category.id];
  const [query, setQuery] = React.useState('');
  const visible = React.useMemo(() => {
    if (!query.trim()) return category.tools;
    const q = query.toLowerCase();
    return category.tools.filter((t) => t.label.toLowerCase().includes(q));
  }, [query, category.tools]);

  const cols = category.tools.length >= 30 ? 4 : category.tools.length >= 12 ? 3 : category.tools.length >= 6 ? 2 : 1;

  return (
    <>
      <style>{`@keyframes xdrop{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:none}}`}</style>
      <div
        onMouseEnter={onStay}
        onMouseLeave={onClose}
        style={{
          position: 'absolute',
          top: dropPos.top,
          left: dropPos.left,
          zIndex: 999,
          width: dropPos.width,
          animation: 'xdrop 160ms cubic-bezier(.16,1,.3,1) both',
        }}
      >
        {/* Card */}
        <div className="border border-black/[0.08] bg-[var(--color-canvas)] shadow-[0_18px_60px_-12px_rgba(0,0,0,0.22)]">
          {/* Header */}
          <div
            className="flex items-center justify-between border-b border-black/[0.06] px-4 py-3"
            style={{ background: `color-mix(in oklch, var(${meta.colorVar}) 12%, transparent)` }}
          >
            <div className="flex items-center gap-2.5">
              <span
                className="grid h-8 w-8 place-items-center text-white"
                style={{ background: `var(${meta.colorVar})` }}
              >
                <TileIcon name={category.icon} size={16} strokeWidth={2} />
              </span>
              <div>
                <div className="text-[14px] font-bold tracking-tight text-[var(--color-fg)]">
                  {category.label}
                </div>
                <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-fg-muted)]">
                  {category.tools.length} tools
                </div>
              </div>
            </div>
            <Link
              href={`/tools?cat=${category.id}`}
              onClick={onItemClick}
              className="px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-white transition hover:brightness-110"
              style={{ background: `var(${meta.colorVar})` }}
            >
              View all →
            </Link>
          </div>

          {/* Search */}
          {category.tools.length > 10 && (
            <div className="border-b border-black/[0.06] px-3 py-2">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={`Filter ${category.label.toLowerCase()} tools…`}
                className="w-full bg-transparent px-1 py-1 text-[12px] text-[var(--color-fg)] placeholder:text-[var(--color-fg-subtle)] focus:outline-none"
                autoFocus
              />
            </div>
          )}

          {/* Tools grid */}
          <div
            className="overflow-y-auto p-2"
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
              gap: 1,
              maxHeight: category.tools.length >= 20 ? 380 : undefined,
            }}
          >
            {visible.length === 0 && (
              <div className="col-span-full px-3 py-6 text-center text-[12px] text-[var(--color-fg-muted)]">
                No tool matches “{query}”
              </div>
            )}
            {visible.map((t) => (
              <DropdownItem
                key={t.slug}
                tool={t}
                colorVar={meta.colorVar}
                onClick={onItemClick}
              />
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

function DropdownItem({
  tool,
  colorVar,
  onClick,
}: {
  tool: CatalogTool;
  colorVar: string;
  onClick: () => void;
}) {
  const live = isToolLive(tool);

  if (!live) {
    return (
      <div
        className="flex items-center gap-2 px-2.5 py-1.5 text-[12px] text-[var(--color-fg-subtle)]"
        title="Coming soon"
      >
        <span className="h-1 w-1 bg-[var(--color-fg-subtle)]" />
        <span className="truncate">{tool.label}</span>
        <span className="ml-auto text-[9px] font-bold uppercase tracking-wider text-[var(--color-fg-subtle)]">soon</span>
      </div>
    );
  }

  return (
    <Link
      href={toolHref(tool)}
      onClick={onClick}
      className="group flex items-center gap-2 px-2.5 py-1.5 text-[12px] font-medium text-[var(--color-fg)] transition hover:bg-black/[0.04]"
    >
      <span className="h-1.5 w-1.5" style={{ background: `var(${colorVar})` }} />
      <span className="truncate">{tool.label}</span>
    </Link>
  );
}
