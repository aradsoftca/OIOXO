'use client';

import * as React from 'react';

/** True when the user is typing in a form field — used to ignore global paste. */
function isEditingTarget(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}

interface Options {
  /** Called with pasted text when the user pastes anywhere on the page (not while typing in a field). */
  onPaste?: (text: string) => void;
  /** Called when Escape is pressed and nothing else is focused (or onClear handles its own focus). */
  onClear?: () => void;
  /**
   * Opt-in: persist a short list of recent queries under this key. When set, the
   * hook returns `recent` (most-recent-first) plus `remember` / `forget` so a
   * lookup tool can show one-click "look this up again" chips. Net users hit the
   * same hosts repeatedly — this turns a re-type into a single click.
   */
  historyKey?: string;
  /** How many recent queries to keep (default 6). */
  historyMax?: number;
}

const HISTORY_NS = 'xonvert:net-history:';

function readHistory(key: string): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(HISTORY_NS + key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed.filter((v) => typeof v === 'string') as string[]) : [];
  } catch {
    return [];
  }
}

function writeHistory(key: string, list: string[]) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(HISTORY_NS + key, JSON.stringify(list));
  } catch {
    /* quota / private mode — recent chips are best-effort */
  }
}

/**
 * Shared input ergonomics for the network lookup tools (IP / DNS / SSL / ports /
 * ping / whois). Lets the user paste an IP or domain anywhere on the tool to
 * fill the query (ignored while typing in a field so it never clobbers edits),
 * and press Escape to clear. One hook lifts every single-query lookup tool.
 *
 * Pass `historyKey` to also get a persisted recent-query list + chips helpers.
 */
export function useQueryHotkeys({ onPaste, onClear, historyKey, historyMax = 6 }: Options) {
  const onPasteRef = React.useRef(onPaste);
  const onClearRef = React.useRef(onClear);
  onPasteRef.current = onPaste;
  onClearRef.current = onClear;

  const [recent, setRecent] = React.useState<string[]>([]);

  // Load persisted history once on mount (client only — avoids SSR hydration mismatch).
  React.useEffect(() => {
    if (historyKey) setRecent(readHistory(historyKey));
  }, [historyKey]);

  const remember = React.useCallback(
    (raw: string) => {
      if (!historyKey) return;
      const q = raw.trim();
      if (!q) return;
      setRecent((prev) => {
        const next = [q, ...prev.filter((v) => v.toLowerCase() !== q.toLowerCase())].slice(0, historyMax);
        writeHistory(historyKey, next);
        return next;
      });
    },
    [historyKey, historyMax],
  );

  const forget = React.useCallback(
    (raw?: string) => {
      if (!historyKey) return;
      setRecent((prev) => {
        const next = raw ? prev.filter((v) => v !== raw) : [];
        writeHistory(historyKey, next);
        return next;
      });
    },
    [historyKey],
  );

  React.useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      // Don't hijack paste while the user is typing in any field — they want it
      // in the focused box, which the browser already handles.
      if (isEditingTarget(e.target) || isEditingTarget(document.activeElement)) return;
      const text = e.clipboardData?.getData('text')?.trim();
      if (text && onPasteRef.current) {
        onPasteRef.current(text);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && onClearRef.current) {
        onClearRef.current();
      }
    };
    window.addEventListener('paste', handlePaste);
    window.addEventListener('keydown', handleKey);
    return () => {
      window.removeEventListener('paste', handlePaste);
      window.removeEventListener('keydown', handleKey);
    };
  }, []);

  return { recent, remember, forget };
}
