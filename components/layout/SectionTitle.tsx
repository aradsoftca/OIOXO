'use client';

import * as React from 'react';
import { cn } from '@/lib/cn';

interface SectionTitleProps {
  label: string;
  colorVar?: string;
  rightSlot?: React.ReactNode;
  className?: string;
}

export function SectionTitle({ label, colorVar, rightSlot, className }: SectionTitleProps) {
  return (
    <div className={cn('flex items-center justify-between pb-1', className)}>
      <h2 className="flex items-center text-[11px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">
        <span
          className="section-dot"
          style={colorVar ? { ['--dot-color' as string]: `var(${colorVar})` } : undefined}
        />
        {label}
      </h2>
      {rightSlot && <div className="text-[12px] text-[var(--color-fg-muted)]">{rightSlot}</div>}
    </div>
  );
}
