'use client';

import * as React from 'react';
import { Globe, Loader2 } from 'lucide-react';
import { powFetch } from '@/lib/pow-client';

interface Props {
  /** Server route that accepts POST { url } and returns { text } or { error }. */
  endpoint: string;
  /** Called with the fetched text on success. */
  onText: (text: string) => void;
  placeholder?: string;
  colorVar?: string;
}

/**
 * URL → fetch bar for the self-hosted SEO / header tools. The browser can't
 * read cross-origin pages (CORS), so we fetch on the server and hand the text
 * back to the existing client-side parser.
 */
export function FetchUrlBar({ endpoint, onText, placeholder = 'https://example.com', colorVar = '--color-cat-seo' }: Props) {
  const [url, setUrl] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');

  const run = async () => {
    const u = url.trim();
    if (!u) return;
    setBusy(true); setError('');
    try {
      const res = await powFetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: u }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Fetch failed (${res.status})`);
      onText(data.text ?? '');
    } catch (e) {
      setError((e as Error).message || 'Could not fetch that URL.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-1.5">
      <form onSubmit={(e) => { e.preventDefault(); void run(); }} className="flex gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2 border border-black/[0.08] bg-[var(--color-surface-1)] px-3">
          <Globe className="h-4 w-4 shrink-0 text-[var(--color-fg-subtle)]" />
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder={placeholder}
            className="min-w-0 flex-1 bg-transparent py-2.5 text-[14px] text-[var(--color-fg)] placeholder:text-[var(--color-fg-subtle)] focus:outline-none"
          />
        </div>
        <button
          type="submit"
          disabled={busy || !url.trim()}
          className="flex shrink-0 items-center gap-2 px-5 py-2.5 text-[12px] font-bold uppercase tracking-wider text-white transition hover:brightness-110 disabled:bg-black/[0.06] disabled:text-[var(--color-fg-subtle)]"
          style={!busy && url.trim() ? { background: `var(${colorVar})` } : undefined}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Globe className="h-4 w-4" />} Fetch
        </button>
      </form>
      {error && <div className="text-[12px] text-red-600">{error}</div>}
    </div>
  );
}
