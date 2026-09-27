'use client';

import * as React from 'react';
import { cn } from '@/lib/cn';
import { ICONS } from '@/lib/icon-map';

interface TileIconProps {
  name: string;
  className?: string;
  size?: number;
  strokeWidth?: number;
}

/**
 * Render a Lucide icon by string name from the explicit map in lib/icon-map.ts
 * (NOT `import * as Lucide`, which bundled every icon into each page).
 * Falls back to Square if the name is unknown — add new names to the map.
 */
export function TileIcon({ name, className, size = 28, strokeWidth = 1.5 }: TileIconProps) {
  // Lucide exports PascalCase names; allow either kebab or pascal
  const pascal = name
    .split(/[-_]/)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join('');

  const Comp = ICONS[pascal] ?? ICONS.Square;

  return <Comp className={cn('shrink-0', className)} size={size} strokeWidth={strokeWidth} />;
}
