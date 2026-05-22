'use client';

import * as React from 'react';
import * as Lucide from 'lucide-react';
import { cn } from '@/lib/cn';

interface TileIconProps {
  name: string;
  className?: string;
  size?: number;
  strokeWidth?: number;
}

/**
 * Render any Lucide icon by string name.
 * Falls back to Square if the name is unknown.
 */
export function TileIcon({ name, className, size = 28, strokeWidth = 1.5 }: TileIconProps) {
  // Lucide exports PascalCase names; allow either kebab or pascal
  const pascal = name
    .split(/[-_]/)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join('');

  const Comp =
    (Lucide as unknown as Record<string, React.ComponentType<Lucide.LucideProps>>)[pascal] ??
    Lucide.Square;

  return <Comp className={cn('shrink-0', className)} size={size} strokeWidth={strokeWidth} />;
}
