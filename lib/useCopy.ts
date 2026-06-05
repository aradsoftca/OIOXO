'use client';

import * as React from 'react';

/**
 * Tiny clipboard hook shared across tools so "click a value → it's copied"
 * behaves identically everywhere (same 1.4s "copied" window, same fallback
 * for non-secure contexts where navigator.clipboard is undefined).
 *
 * `copied` holds the key of the last copied item (or `true` for the single-slot
 * case) so callers can flip an icon. Pass any stable key per copyable element.
 */
export function useCopy(resetMs = 1400) {
  const [copied, setCopied] = React.useState<string | null>(null);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const copy = React.useCallback(async (value: string, key = '__single__') => {
    const text = value ?? '';
    let ok = false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        ok = true;
      }
    } catch {
      ok = false;
    }
    if (!ok && typeof document !== 'undefined') {
      // Fallback for http / older browsers where the async clipboard is blocked.
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        ok = document.execCommand('copy');
        document.body.removeChild(ta);
      } catch {
        ok = false;
      }
    }
    if (ok) {
      setCopied(key);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(null), resetMs);
    }
    return ok;
  }, [resetMs]);

  return { copied, copy };
}
