'use client';

import * as React from 'react';
import { Copy, Check, ClipboardCheck, Braces } from 'lucide-react';
import { cn } from '@/lib/cn';

export interface ResultRowData {
  /** Field name shown on the left. */
  label: string;
  /** Display value. Falsy/empty rows are dropped automatically. */
  value: unknown;
  /** Optional copy payload — defaults to the stringified value. */
  copyText?: string;
}

interface ResultGridProps {
  rows: ResultRowData[];
  /** Accent CSS var for the category (e.g. "--color-cat-ip"). */
  colorVar?: string;
  /** One or two columns on wider screens. Defaults to 2. */
  columns?: 1 | 2;
  /** Title shown above the "Copy all" affordance. */
  title?: string;
  /** Show a "Copy JSON" affordance next to "Copy all" (default true). Net users
   * paste lookup results straight into scripts/configs — JSON export is the
   * difference between a toy and a tool. */
  json?: boolean;
}

const isEmpty = (v: unknown) =>
  v === undefined || v === null || v === '' || (typeof v === 'number' && Number.isNaN(v));

/** Turn a human label ("Reverse DNS") into a stable JSON key ("reverseDns"). */
function toKey(label: string): string {
  const words = label.trim().toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  return words.map((w, i) => (i === 0 ? w : w[0].toUpperCase() + w.slice(1))).join('') || 'value';
}

/**
 * A clear, copyable key/value results table shared by the network lookup tools
 * (IP / DNS / SSL / ports / ping / whois). Every row is click-to-copy and the
 * whole set can be copied as aligned plain text with one click — the category
 * bar is "clear results table, copy, fast". Empty rows are dropped so callers
 * can pass a fixed schema without filtering.
 */
export function ResultGrid({ rows, colorVar = '--color-cat-ip', columns = 2, title, json = true }: ResultGridProps) {
  const filled = React.useMemo(() => rows.filter((r) => !isEmpty(r.value)), [rows]);
  const [copied, setCopied] = React.useState<string | null>(null);
  const [copiedKind, setCopiedKind] = React.useState<'all' | 'json' | null>(null);

  const copy = React.useCallback(async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied((c) => (c === key ? null : c)), 1200);
    } catch {
      /* clipboard denied (insecure context / iframe) — silent */
    }
  }, []);

  const flash = React.useCallback((kind: 'all' | 'json') => {
    setCopiedKind(kind);
    setTimeout(() => setCopiedKind((k) => (k === kind ? null : k)), 1400);
  }, []);

  const copyAll = React.useCallback(async () => {
    if (!filled.length) return;
    const width = Math.max(...filled.map((r) => r.label.length));
    const text = filled
      .map((r) => `${r.label.padEnd(width)}  ${r.copyText ?? String(r.value)}`)
      .join('\n');
    try {
      await navigator.clipboard.writeText(text);
      flash('all');
    } catch {
      /* silent */
    }
  }, [filled, flash]);

  const copyJson = React.useCallback(async () => {
    if (!filled.length) return;
    const obj: Record<string, unknown> = {};
    for (const r of filled) {
      const raw = r.copyText ?? String(r.value);
      // Keep numbers numeric where the value already was one; everything else stays a string.
      obj[toKey(r.label)] = typeof r.value === 'number' ? r.value : raw;
    }
    try {
      await navigator.clipboard.writeText(JSON.stringify(obj, null, 2));
      flash('json');
    } catch {
      /* silent */
    }
  }, [filled, flash]);

  if (!filled.length) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        {title ? (
          <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">{title}</div>
        ) : <span />}
        <div className="ml-auto inline-flex items-center gap-1.5">
          {json && (
            <button
              type="button"
              onClick={copyJson}
              title="Copy results as JSON"
              className="inline-flex items-center gap-1.5 border border-black/[0.08] px-2.5 py-1 text-[11px] font-medium text-[var(--color-fg-muted)] transition hover:bg-[var(--color-surface-2)] hover:text-[var(--color-fg)]"
            >
              {copiedKind === 'json' ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Braces className="h-3.5 w-3.5" />}
              {copiedKind === 'json' ? 'Copied' : 'JSON'}
            </button>
          )}
          <button
            type="button"
            onClick={copyAll}
            className="inline-flex items-center gap-1.5 border border-black/[0.08] px-2.5 py-1 text-[11px] font-medium text-[var(--color-fg-muted)] transition hover:bg-[var(--color-surface-2)] hover:text-[var(--color-fg)]"
          >
            {copiedKind === 'all' ? <Check className="h-3.5 w-3.5 text-green-600" /> : <ClipboardCheck className="h-3.5 w-3.5" />}
            {copiedKind === 'all' ? 'Copied' : 'Copy all'}
          </button>
        </div>
      </div>
      <div className={cn('grid gap-2', columns === 2 && 'sm:grid-cols-2')}>
        {filled.map((r) => {
          const text = r.copyText ?? String(r.value);
          const active = copied === r.label;
          return (
            <button
              key={r.label}
              type="button"
              onClick={() => copy(r.label, text)}
              title="Click to copy"
              className="group flex items-center justify-between gap-3 border border-black/[0.08] bg-[var(--color-surface-1)] px-4 py-2.5 text-left transition hover:bg-[var(--color-surface-2)]"
            >
              <span className="shrink-0 text-[12px] text-[var(--color-fg-muted)]">{r.label}</span>
              <span className="flex min-w-0 items-center gap-2">
                <span className="truncate font-mono text-[12px] text-[var(--color-fg)]">{String(r.value)}</span>
                {active
                  ? <Check className="h-3.5 w-3.5 shrink-0 text-green-600" />
                  : <Copy className="h-3.5 w-3.5 shrink-0 text-[var(--color-fg-subtle)] opacity-0 transition group-hover:opacity-100" style={{ color: `var(${colorVar})` }} />}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
