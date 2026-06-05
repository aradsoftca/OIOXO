'use client';

import * as React from 'react';
import { Copy, Check } from 'lucide-react';
import { cn } from '@/lib/cn';

/**
 * Shared clipboard primitive for the generator category.
 *
 * Almost every generator (gradient, box-shadow, css-filter, glassmorphism,
 * color-converter, palette, transform, text-shadow, …) reimplemented the same
 * `copy()` + `copied` state + reset-timer dance, each with a slightly different
 * style and — crucially — each silently failing when `navigator.clipboard` is
 * unavailable (insecure context, sandboxed iframe, older mobile browsers).
 *
 * `useCopy` centralises that:
 *   - modern async Clipboard API first
 *   - falls back to a hidden <textarea> + execCommand('copy') so it still works
 *     inside the tool iframe / on http / on older Safari
 *   - tracks WHICH value was copied (for click-to-copy lists) and auto-resets
 */
export function useCopy(resetMs = 1400) {
  const [copied, setCopied] = React.useState<string | null>(null);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const copy = React.useCallback(
    async (text: string, id?: string): Promise<boolean> => {
      const ok = await writeClipboard(text);
      if (ok) {
        setCopied(id ?? text);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setCopied(null), resetMs);
      }
      return ok;
    },
    [resetMs],
  );

  /** True if `id` (or, when omitted, anything) was just copied. */
  const isCopied = React.useCallback(
    (id?: string) => (id === undefined ? copied !== null : copied === id),
    [copied],
  );

  return { copy, copied, isCopied };
}

/** Robust clipboard write with a legacy fallback. Returns success. */
export async function writeClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to legacy path (permission denied / insecure context) */
  }
  // Legacy fallback: works in sandboxed iframes & non-secure origins where the
  // async Clipboard API is blocked.
  try {
    if (typeof document === 'undefined') return false;
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '-9999px';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, text.length);
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

interface CopyButtonProps {
  /** Text to place on the clipboard. */
  value: string;
  /** Button label when idle (default "Copy CSS"). */
  label?: string;
  /** Label shown briefly after a successful copy (default "Copied"). */
  copiedLabel?: string;
  /** Visual style. "primary" = filled dark bar, "accent" = category accent. */
  variant?: 'primary' | 'accent';
  className?: string;
  disabled?: boolean;
  /** Optional callback after a copy attempt (e.g. analytics). */
  onCopied?: (ok: boolean) => void;
  title?: string;
}

/**
 * The big "Copy CSS" / "Copy" action bar shared by the CSS & color generators.
 * Drop-in replacement for the per-tool button + state that each file carried.
 */
export function CopyButton({
  value,
  label = 'Copy CSS',
  copiedLabel = 'Copied',
  variant = 'primary',
  className,
  disabled,
  onCopied,
  title,
}: CopyButtonProps) {
  const { copy, isCopied } = useCopy();
  const done = isCopied(value);

  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={async () => {
        const ok = await copy(value, value);
        onCopied?.(ok);
      }}
      className={cn(
        'inline-flex items-center justify-center gap-2 py-2.5 text-[12px] font-bold uppercase tracking-wider transition disabled:opacity-50',
        variant === 'accent'
          ? 'bg-[var(--color-cat-generator)] text-white shadow-lg hover:brightness-110'
          : 'bg-[var(--color-fg)] text-[var(--color-canvas)] hover:opacity-90',
        className,
      )}
    >
      {done ? (
        <>
          <Check className="h-4 w-4" /> {copiedLabel}
        </>
      ) : (
        <>
          <Copy className="h-4 w-4" /> {label}
        </>
      )}
    </button>
  );
}
