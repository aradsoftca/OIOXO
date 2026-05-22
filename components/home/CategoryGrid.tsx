import Link from 'next/link';
import { CATALOG, isToolLive } from '@/lib/catalog';
import { CATEGORIES } from '@/lib/registry/types';
import { TileIcon } from '@/components/tiles/TileIcon';

/**
 * Uniform, perfectly-aligned category grid (premium light). Every card is the
 * same size: colored icon chip + name + live tool count. Live counts come from
 * the catalog, not hardcoded numbers.
 */
export function CategoryGrid() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
      {CATALOG.map((cat) => {
        const meta = CATEGORIES[cat.id];
        const liveCount = cat.tools.filter((t) => isToolLive(t)).length;
        const total = cat.tools.length;
        return (
          <Link
            key={cat.id}
            href={`/tools?cat=${cat.id}`}
            className="group flex items-center gap-3 rounded-2xl border border-black/[0.06] bg-white/70 p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition duration-200 hover:-translate-y-0.5 hover:border-black/[0.12] hover:bg-white hover:shadow-[0_10px_28px_-8px_rgba(0,0,0,0.18)]"
          >
            <span
              className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-white shadow-sm transition-transform duration-200 group-hover:scale-105"
              style={{ background: `var(${meta.colorVar})` }}
            >
              <TileIcon name={cat.icon} size={20} strokeWidth={2} />
            </span>
            <div className="min-w-0">
              <div className="truncate text-[14px] font-semibold tracking-tight text-[var(--color-fg)]">
                {cat.label}
              </div>
              <div className="text-[11px] text-[var(--color-fg-muted)]">
                {liveCount > 0 ? `${liveCount} tools` : `${total} soon`}
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
