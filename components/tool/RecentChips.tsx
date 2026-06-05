'use client';

import * as React from 'react';
import { History, X } from 'lucide-react';

interface Props {
  /** Most-recent-first list of past queries (from useQueryHotkeys' historyKey). */
  recent: string[];
  /** Re-run a past query. */
  onPick: (q: string) => void;
  /** Remove one entry, or all when called with no argument. */
  onForget: (q?: string) => void;
  /** Accent CSS var for the category (e.g. "--color-cat-ip"). */
  colorVar?: string;
}

/**
 * One-click "recent lookups" chips shared by the network lookup tools
 * (IP / DNS / SSL / ports / ping / whois). Net users hit the same hosts over and
 * over — surfacing the last few queries turns a re-type into a single click,
 * which is the core flow win for the category ("clear, copy, fast"). Renders
 * nothing when there is no history, so callers can drop it in unconditionally.
 */
export function RecentChips({ recent, onPick, onForget, colorVar = '--color-cat-ip' }: Props) {
  if (!recent.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--color-fg-subtle)]">
        <History className="h-3 w-3" /> Recent
      </span>
      {recent.map((q) => (
        <span
          key={q}
          className="group inline-flex items-center overflow-hidden border border-black/[0.08] bg-[var(--color-surface-1)] text-[12px] text-[var(--color-fg-muted)] transition hover:border-black/[0.16] hover:text-[var(--color-fg)]"
        >
          <button
            type="button"
            onClick={() => onPick(q)}
            title={`Look up ${q} again`}
            className="max-w-[180px] truncate py-1 pl-2.5 pr-1.5 font-mono transition group-hover:text-[var(--color-fg)]"
            style={{ ['--hover' as string]: `var(${colorVar})` }}
          >
            {q}
          </button>
          <button
            type="button"
            onClick={() => onForget(q)}
            title="Remove from history"
            aria-label={`Remove ${q} from history`}
            className="grid h-full place-items-center px-1.5 text-[var(--color-fg-subtle)] opacity-0 transition hover:text-[var(--color-fg)] focus:opacity-100 group-hover:opacity-100"
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      {recent.length > 1 && (
        <button
          type="button"
          onClick={() => onForget()}
          className="text-[11px] text-[var(--color-fg-subtle)] underline-offset-2 transition hover:text-[var(--color-fg)] hover:underline"
        >
          Clear
        </button>
      )}
    </div>
  );
}
