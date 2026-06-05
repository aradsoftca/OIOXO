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
export function ClientOnly({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) {
    return <div className="h-96 animate-pulse bg-[var(--color-surface-1)]" />;
  }
  return <>{children}</>;
}
