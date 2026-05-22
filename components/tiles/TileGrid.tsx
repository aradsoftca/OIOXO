'use client';

import * as React from 'react';
import { cn } from '@/lib/cn';

interface TileGridProps extends React.HTMLAttributes<HTMLDivElement> {
  cols?: number;
  /** Stagger child entrance animations */
  stagger?: boolean;
}

/**
 * Bento/Live-Tiles grid container.
 * When `stagger` is on, each direct child gets an entrance delay based on
 * its DOM order — a clean cascade on first render.
 */
export function TileGrid({ cols = 4, stagger = true, className, children, ...rest }: TileGridProps) {
  const arr = React.Children.toArray(children);

  return (
    <div
      className={cn(
        'tile-grid grid auto-rows-[var(--tile-unit)] gap-[var(--tile-gap)]',
        'grid-flow-dense',
        stagger && 'tile-stagger',
        className,
      )}
      style={{
        ['--tile-cols' as string]: cols,
      }}
      {...rest}
    >
      {stagger
        ? arr.map((child, i) => (
            <div
              key={(child as React.ReactElement).key ?? i}
              style={{ ['--stagger-i' as string]: i, display: 'contents' }}
            >
              {child}
            </div>
          ))
        : children}
    </div>
  );
}
