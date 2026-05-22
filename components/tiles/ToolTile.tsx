'use client';

import * as React from 'react';
import { Tile } from './Tile';
import { TileIcon } from './TileIcon';
import { CATEGORIES, type ToolManifest } from '@/lib/registry/types';
import { getRecent } from '@/lib/storage/recent';

interface ToolTileProps {
  tool: ToolManifest;
  size?: ToolManifest['tile'];
  flipDelay?: string;
}

/**
 * The canonical tool tile — shows live recent output if available,
 * otherwise icon + name + category. Honors the manifest's accepts list
 * for the drop-magic shimmer. Adds corner ribbon for Pro / New.
 */
export function ToolTile({ tool, size, flipDelay }: ToolTileProps) {
  const [recentThumb, setRecentThumb] = React.useState<string | undefined>();
  const cat = CATEGORIES[tool.category];
  const effectiveSize = size ?? tool.tile;

  React.useEffect(() => {
    const refresh = () => setRecentThumb(getRecent(tool.id)?.thumb);
    refresh();
    window.addEventListener('xonvert:recent-update', refresh);
    return () => window.removeEventListener('xonvert:recent-update', refresh);
  }, [tool.id]);

  const ribbon =
    tool.compute === 'pro'
      ? { label: 'Pro', color: 'oklch(72% 0.20 60)' }
      : undefined;

  return (
    <Tile
      size={effectiveSize}
      colorVar={cat.colorVar}
      href={`/tools/${tool.id}`}
      acceptsDrop={(tool.accepts?.length ?? 0) > 0}
      live={!recentThumb}
      flipDelay={flipDelay}
      transitionName={`tile-${tool.id}`}
      ribbon={ribbon}
      aria-label={`${tool.name} — ${tool.blurb}`}
    >
      {recentThumb && (
        <>
          <div
            className="pointer-events-none absolute inset-0 z-0 opacity-65 mix-blend-screen"
            style={{
              backgroundImage: `url(${recentThumb})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              filter: 'saturate(0.9) contrast(1.05)',
            }}
          />
          <div className="pointer-events-none absolute inset-0 z-0 bg-gradient-to-t from-black/75 via-black/30 to-transparent" />
        </>
      )}

      {/* Top: icon — larger, bolder stroke */}
      <div className="relative z-10 flex items-start justify-between">
        <TileIcon name={tool.icon} size={30} strokeWidth={1.75} className="text-white drop-shadow-sm" />
      </div>

      {/* Bottom: name + blurb */}
      <div className="relative z-10">
        <div className="text-[15px] font-semibold leading-tight tracking-tight text-white text-pretty">
          {tool.name}
        </div>
        {effectiveSize !== 'S' && (
          <div className="mt-1 text-[12px] font-medium leading-snug text-white/75 text-pretty line-clamp-2">
            {tool.blurb}
          </div>
        )}
      </div>
    </Tile>
  );
}
