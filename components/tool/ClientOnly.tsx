'use client';

import { useState, useEffect, type ReactNode } from 'react';

/**
 * Render children ONLY on the client. The tool UI modules (and their `@/lib/studios`
 * deps) touch `document`/`window` at module load; server-rendering them during static
 * export crashes the build (`ReferenceError: document is not defined`, e.g. image-studio).
 *
 * Because the children include a `next/dynamic` component, the lazy import only fires when
 * React actually renders it — and on the server we render the placeholder instead, so the
 * tool module is never evaluated server-side. First client render also returns the
 * placeholder (matching SSR) to avoid a hydration mismatch, then mounts the real UI.
 *
 * SEO is unaffected: the indexable content (RichToolSection + JSON-LD) is rendered by the
 * server page around this; only the interactive widget is deferred to the client.
 */
export function ClientOnly({ children, fallback }: { children: ReactNode; fallback?: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) {
    // The pre-mount placeholder a user actually sees while the heavy client
    // bundle loads. Studios pass a branded full-height loader; everything else
    // gets a calm centered spinner (the old bare grey `h-96` pulse read as a
    // broken blank box).
    return (
      <>
        {fallback ?? (
          <div className="flex h-72 w-full flex-col items-center justify-center gap-3 rounded-xl border border-[var(--color-stroke)] bg-[var(--color-surface-1)] text-[var(--color-fg-muted)]">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-black/10 border-t-[var(--color-fg)]" />
            <div className="text-[12px] font-medium tracking-wide text-[var(--color-fg-subtle)]">Loading…</div>
          </div>
        )}
      </>
    );
  }
  return <>{children}</>;
}
