'use client';
import * as React from 'react';
import { Download, Loader2 } from 'lucide-react';
import type { Category } from '@/lib/registry/types';
import { useUsageGate } from '@/components/usage/use-usage-gate';

interface Props {
  colorVar: string;
  busy: boolean;
  progress: number;
  disabled?: boolean;
  label: string;
  busyLabel: string;
  onClick: () => void;
  error?: string;
  /** When set, the click is metered through the freemium gate for this category. */
  gateCategory?: Category;
  /** Input file size (bytes) — enables the free-tier size gate for this action. */
  gateBytes?: number;
}

export function FfmpegRunButton({ colorVar, busy, progress, disabled = false, label, busyLabel, onClick, error, gateCategory, gateBytes }: Props) {
  const { guard, gate } = useUsageGate(gateCategory ?? 'video');
  const handleClick = async () => {
    if (gateCategory && !(await guard(gateBytes != null ? { bytes: gateBytes } : undefined))) return;
    onClick();
  };
  return (
    <div className="space-y-2">
      {gateCategory && gate}
      <button
        type="button"
        onClick={handleClick}
        disabled={busy || disabled}
        className={`flex w-full items-center justify-center gap-2 py-3 text-[12px] font-bold uppercase tracking-wider text-white shadow-lg transition hover:brightness-110 disabled:bg-black/[0.06] disabled:text-[var(--color-fg-subtle)] disabled:shadow-none`}
        style={{ background: !(busy || disabled) ? `var(${colorVar})` : undefined }}
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
        {busy ? `${busyLabel} ${progress}%` : label}
      </button>
      {error && <div className="text-[12px] text-red-600">{error}</div>}
    </div>
  );
}
