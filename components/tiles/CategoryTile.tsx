'use client';

import * as React from 'react';
import { Tile } from './Tile';
import { TileIcon } from './TileIcon';
import { CATEGORIES, type Category } from '@/lib/registry/types';

interface CategoryTileProps {
  category: Category;
  count: number;
  icon: string;
  size?: 'S' | 'M' | 'L' | 'W';
}

export function CategoryTile({ category, count, icon, size = 'M' }: CategoryTileProps) {
  const cat = CATEGORIES[category];

  return (
    <Tile
      size={size}
      colorVar={cat.colorVar}
      href={`/tools?cat=${category}`}
      transitionName={`cat-${category}`}
      aria-label={`${cat.name} — ${count} tools`}
    >
      <div className="flex items-start justify-between">
        <TileIcon name={icon} size={30} strokeWidth={1.75} className="text-white" />
        <span className="font-mono text-[30px] font-bold leading-none text-white tabular-nums">
          {count}
        </span>
      </div>
      <div>
        <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/75">
          Category
        </div>
        <div className="mt-0.5 text-[20px] font-semibold leading-tight tracking-tight text-white">
          {cat.name}
        </div>
        <div className="mt-1 text-[12px] font-medium text-white/70">{cat.blurb}</div>
      </div>
    </Tile>
  );
}
