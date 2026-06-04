'use client';

import * as React from 'react';
import { cn } from '@/lib/cn';

export interface QuickAction {
  label: string;
  icon?: React.ReactNode;
  description?: string;
  onClick: () => void;
  primary?: boolean;
}

export function EmptyState({
  icon, title, description, actions, hints, className,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  actions?: QuickAction[];
  hints?: { label: string; description?: string }[];
  className?: string;
}) {
  return (
    <div className={cn('flex flex-1 items-start sm:items-center justify-center overflow-y-auto p-4 sm:p-6', className)}>
      <div className="w-full max-w-md text-center">
        {icon && (
          <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-cyan-500/20 to-purple-500/20 text-cyan-300 shadow-xl ring-1 ring-white/5">
            {icon}
          </div>
        )}
        <h2 className="text-base font-bold text-zinc-100">{title}</h2>
        {description && <p className="mt-1 text-xs leading-relaxed text-zinc-400">{description}</p>}
        {actions && actions.length > 0 && (
          <div className="mt-5 flex flex-col items-stretch gap-2">
            {actions.map((a, i) => (
              <button
                key={a.label + i}
                onClick={a.onClick}
                className={cn(
                  'group flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-all',
                  a.primary
                    ? 'border-cyan-400/40 bg-cyan-500/10 text-cyan-100 hover:bg-cyan-500/15 hover:border-cyan-400/60'
                    : 'border-white/10 bg-white/[.02] text-zinc-200 hover:border-white/20 hover:bg-white/5',
                )}
              >
                {a.icon && <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-white/5 text-zinc-300 group-hover:text-zinc-100">{a.icon}</span>}
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold">{a.label}</div>
                  {a.description && <div className="text-[10px] text-zinc-500">{a.description}</div>}
                </div>
                <span className="text-zinc-500 group-hover:translate-x-0.5 transition-transform">→</span>
              </button>
            ))}
          </div>
        )}
        {hints && hints.length > 0 && (
          <div className="mt-5 space-y-1 rounded-lg border border-white/5 bg-white/[.02] p-3 text-left">
            <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Tips</div>
            {hints.map((h, i) => (
              <div key={i} className="flex items-start gap-2 text-[11px]">
                <span className="text-cyan-300">•</span>
                <div>
                  <span className="text-zinc-300">{h.label}</span>
                  {h.description && <span className="text-zinc-500"> — {h.description}</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function Skeleton({ className, lines = 3, width = 'full' }: { className?: string; lines?: number; width?: 'full' | 'half' | 'third' }) {
  const widthClass = width === 'full' ? 'w-full' : width === 'half' ? 'w-1/2' : 'w-1/3';
  return (
    <div className={cn('space-y-2', className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className={cn(
            'h-3 animate-pulse rounded bg-white/5',
            i === lines - 1 ? widthClass : 'w-full',
          )}
        />
      ))}
    </div>
  );
}

export function LoadingOverlay({ label, progress }: { label?: string; progress?: number }) {
  return (
    <div className="pointer-events-none fixed inset-0 z-[80] flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="flex flex-col items-center gap-3 rounded-lg border border-white/10 bg-[#0f1115]/95 px-6 py-5 shadow-2xl">
        <div className="relative h-10 w-10">
          <div className="absolute inset-0 rounded-full border-2 border-white/10" />
          <div className="absolute inset-0 animate-spin rounded-full border-2 border-cyan-400 border-r-transparent border-b-transparent" />
        </div>
        {label && <div className="text-xs font-medium text-zinc-200">{label}</div>}
        {progress != null && (
          <div className="h-1 w-44 overflow-hidden rounded-full bg-white/10">
            <div className="h-full bg-cyan-400 transition-all duration-200" style={{ width: `${Math.max(0, Math.min(100, progress))}%` }} />
          </div>
        )}
      </div>
    </div>
  );
}

export function ProgressDots({ count = 3 }: { count?: number }) {
  return (
    <div className="inline-flex items-center gap-1">
      {Array.from({ length: count }).map((_, i) => (
        <span
          key={i}
          className="h-1 w-1 animate-pulse rounded-full bg-current"
          style={{ animationDelay: `${i * 200}ms` }}
        />
      ))}
    </div>
  );
}
