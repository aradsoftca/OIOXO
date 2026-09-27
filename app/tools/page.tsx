import * as React from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { TileIcon } from '@/components/tiles/TileIcon';
import { SectionTitle } from '@/components/layout/SectionTitle';
import { CATALOG, isLive, liveCount, TOTAL_TOOLS } from '@/lib/catalog';
import { CATEGORIES } from '@/lib/registry/types';
import { TOOLS } from '@/lib/registry';
import { BRAND } from '@/lib/brand';
import { buildMeta } from '@/lib/seo/meta';

export const metadata: Metadata = buildMeta({
  path: '/tools',
  title: 'All tools',
  description: `Every ${BRAND} tool, grouped by category.`,
});

interface SearchParams {
  cat?: string;
}

export default async function ToolsIndex({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { cat } = await searchParams;
  const filtered = cat ? CATALOG.filter((c) => c.id === cat) : CATALOG;
  // Live tools the category catalog doesn't list (69 at last count) — without
  // this they were reachable only through the sitemap.
  const catalogued = new Set(CATALOG.flatMap((c) => c.tools.map((t) => t.slug)));
  const uncatalogued = cat ? [] : TOOLS.filter((t) => !catalogued.has(t.id));

  return (
    <div className="space-y-10">
      <header className="space-y-3">
        <SectionTitle label="Tools" colorVar="--color-cat-dev" />
        <h1 className="text-[40px] font-bold tracking-tight text-[var(--color-fg)]">
          {cat ? CATALOG.find((c) => c.id === cat)?.label : 'All tools'}
        </h1>
        <p className="max-w-2xl text-[14px] text-[var(--color-fg-muted)]">
          <strong className="text-[var(--color-fg)]">{TOOLS.length}</strong> tools live ·{' '}
          <strong className="text-[var(--color-fg)]">{TOTAL_TOOLS}</strong> planned across{' '}
          <strong className="text-[var(--color-fg)]">{CATALOG.length}</strong> categories.{' '}
          Files stay yours — use the bar above to jump anywhere.
        </p>
        {cat && (
          <Link
            href="/tools"
            className="inline-flex items-center gap-1 text-[12px] font-medium text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]"
          >
            ← All categories
          </Link>
        )}
      </header>

      <div className="space-y-12">
        {filtered.map((category) => {
          const meta = CATEGORIES[category.id];
          const live = liveCount(category);
          return (
            <section key={category.id} className="space-y-3">
              <div className="flex items-end justify-between border-b border-black/[0.08] pb-2">
                <div className="flex items-center gap-3">
                  <span
                    className="grid h-10 w-10 place-items-center text-white"
                    style={{ background: `var(${meta.colorVar})` }}
                  >
                    <TileIcon name={category.icon} size={20} strokeWidth={1.75} />
                  </span>
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">
                      {meta.blurb}
                    </div>
                    <h2 className="text-[24px] font-bold leading-tight tracking-tight text-[var(--color-fg)]">
                      {category.label}
                    </h2>
                  </div>
                </div>
                <div className="text-[12px] text-[var(--color-fg-muted)]">
                  <strong className="text-[var(--color-fg)]">{live}</strong> live · {category.tools.length} total
                </div>
              </div>

              <div className="grid grid-cols-2 gap-[2px] md:grid-cols-3 lg:grid-cols-4">
                {category.tools.map((tool) => {
                  const ready = isLive(tool.slug);
                  if (ready) {
                    return (
                      <Link prefetch={false}
                        key={tool.slug}
                        href={`/tools/${tool.slug}`}
                        className="group flex items-center gap-2 bg-[var(--color-surface-1)] px-3 py-2.5 text-[13px] font-medium text-[var(--color-fg)] transition hover:bg-[var(--color-surface-2)]"
                      >
                        <span
                          className="h-1.5 w-1.5 shrink-0 transition-transform group-hover:scale-150"
                          style={{ background: `var(${meta.colorVar})` }}
                        />
                        <span className="truncate">{tool.label}</span>
                        <span className="ml-auto text-[10px] font-bold uppercase tracking-wider text-[var(--color-fg-subtle)] transition group-hover:text-[var(--color-fg-muted)]">
                          →
                        </span>
                      </Link>
                    );
                  }
                  return (
                    <div
                      key={tool.slug}
                      className="flex items-center gap-2 bg-[var(--color-surface-1)]/40 px-3 py-2.5 text-[13px] text-[var(--color-fg-subtle)]"
                      title="Coming soon"
                    >
                      <span className="h-1.5 w-1.5 shrink-0 bg-[var(--color-fg-subtle)]" />
                      <span className="truncate">{tool.label}</span>
                      <span className="ml-auto text-[9px] font-bold uppercase tracking-wider">
                        soon
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
        {uncatalogued.length > 0 && (
          <section className="space-y-3">
            <div className="border-b border-black/[0.08] pb-2">
              <h2 className="text-[24px] font-bold leading-tight tracking-tight text-[var(--color-fg)]">More tools</h2>
            </div>
            <div className="grid grid-cols-2 gap-[2px] md:grid-cols-3 lg:grid-cols-4">
              {uncatalogued.map((tool) => (
                <Link prefetch={false}
                  key={tool.id}
                  href={`/tools/${tool.id}`}
                  className="flex items-center gap-2 bg-[var(--color-surface-1)] px-3 py-2.5 text-[13px] font-medium text-[var(--color-fg)] transition hover:bg-[var(--color-surface-2)]"
                >
                  <span className="truncate">{tool.name}</span>
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
