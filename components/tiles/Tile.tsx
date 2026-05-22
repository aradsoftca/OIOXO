'use client';

import * as React from 'react';
import Link from 'next/link';
import { cn } from '@/lib/cn';
import type { TileSize } from '@/lib/registry/types';

interface TileProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'onPointerMove' | 'onPointerDown' | 'onPointerUp' | 'onPointerLeave'> {
  size?: TileSize;
  /** OKLCH color CSS variable name, e.g. "--color-cat-image" */
  colorVar?: string;
  /** Optional fixed color override */
  color?: string;
  /** Neutral surface tile (cream/white with dark text) instead of colored */
  neutral?: boolean;
  /** If provided, the tile renders as a Next Link */
  href?: string;
  acceptsDrop?: boolean;
  live?: boolean;
  flipDelay?: string;
  transitionName?: string;
  ribbon?: { label: string; color?: string };
}

export const Tile = React.forwardRef<HTMLDivElement, TileProps>(
  ({
    size = 'S',
    colorVar,
    color,
    neutral,
    href,
    acceptsDrop,
    live,
    flipDelay,
    transitionName,
    ribbon,
    className,
    style,
    children,
    ...rest
  }, ref) => {
    const localRef = React.useRef<HTMLDivElement>(null);
    React.useImperativeHandle(ref, () => localRef.current!, []);

    const tileColor = color ?? (colorVar ? `var(${colorVar})` : undefined);

    // Spans assume the 4-col desktop bento. On phones the grid drops to 2
    // columns (see .tile-grid), so the full-width W tile is capped at 2 there.
    const sizeClasses = {
      S: 'col-span-1 row-span-1',
      M: 'col-span-2 row-span-1',
      L: 'col-span-2 row-span-2',
      W: 'col-span-2 row-span-2 sm:col-span-4',
    }[size];

    const onPointerDown = React.useCallback((e: React.PointerEvent<HTMLDivElement>) => {
      const el = localRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width;
      const y = (e.clientY - rect.top) / rect.height;
      const tiltMag = 6;
      const rotY = (x - 0.5) * tiltMag;
      const rotX = -(y - 0.5) * tiltMag;
      el.style.setProperty('--tilt-x', `${rotX.toFixed(2)}deg`);
      el.style.setProperty('--tilt-y', `${rotY.toFixed(2)}deg`);
    }, []);

    const onPointerUp = React.useCallback(() => {
      const el = localRef.current;
      if (!el) return;
      el.style.setProperty('--tilt-x', '0deg');
      el.style.setProperty('--tilt-y', '0deg');
    }, []);

    const inner = (
      <div
        ref={localRef}
        data-tile-size={size}
        data-accepts-drop={acceptsDrop ? 'true' : undefined}
        data-neutral={neutral ? 'true' : undefined}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        className={cn(
          'tile-surface group cursor-pointer select-none',
          sizeClasses,
          className,
        )}
        style={{
          ...style,
          ['--tile-color' as string]: neutral ? undefined : tileColor,
          viewTransitionName: transitionName,
        }}
        {...rest}
      >
        {ribbon && (
          <div
            className="tile-ribbon"
            style={{ ['--ribbon-color' as string]: ribbon.color ?? 'var(--color-cat-seo)' }}
          >
            <div className="tile-ribbon-text">{ribbon.label}</div>
          </div>
        )}
        {live ? (
          <div className="tile-flip-host h-full w-full">
            <div
              className="tile-flip-inner h-full w-full"
              style={{ ['--flip-delay' as string]: flipDelay }}
            >
              <div className="tile-content h-full w-full">{children}</div>
            </div>
          </div>
        ) : (
          <div className="tile-content">{children}</div>
        )}
      </div>
    );

    if (href) {
      return (
        <Link
          href={href}
          className="block focus-visible:outline-none"
          aria-label={typeof rest['aria-label'] === 'string' ? rest['aria-label'] : undefined}
        >
          {inner}
        </Link>
      );
    }

    return inner;
  },
);
Tile.displayName = 'Tile';
