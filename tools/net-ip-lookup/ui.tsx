'use client';
import { powFetch } from '@/lib/pow-client';

import * as React from 'react';
import { Loader2, Search } from 'lucide-react';

interface Result {
  ip?: string; error?: string; resolvedFrom?: string;
  city?: string; region?: string; country?: string; countryCode?: string;
  latitude?: number; longitude?: number; postal?: string;
  asn?: number; org?: string; timezone?: string; reverseDns?: string;
}

export default function Tool() {
  const [query, setQuery] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [res, setRes] = React.useState<Result | null>(null);
  const [error, setError] = React.useState('');

  const lookup = React.useCallback(async (q: string) => {
    const target = q.trim();
    setBusy(true); setError(''); setRes(null);
    try {
      // Resolved against our own MaxMind GeoLite2 database — no third-party API.
      const r = await powFetch('/api/net/geoip', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query: target }),
      });
      const data: Result = await r.json();
      if (!r.ok) setError(data.error || 'Lookup failed — check the IP or domain.');
      else setRes(data);
    } catch {
      setError('Network error — please try again.');
    } finally {
      setBusy(false);
    }
  }, []);

  const submit = (e: React.FormEvent) => { e.preventDefault(); if (query.trim()) void lookup(query); };

  const rows: [string, unknown][] = res ? [
    ['IP', res.ip],
    ['City', res.city],
    ['Region', res.region],
    ['Country', `${res.country ?? ''}${res.countryCode ? ` (${res.countryCode})` : ''}`],
    ['Postal', res.postal],
    ['Organization', res.org],
    ['ASN', res.asn ? `AS${res.asn}` : undefined],
    ['Reverse DNS', res.reverseDns],
    ['Timezone', res.timezone],
    ['Coordinates', res.latitude != null ? `${res.latitude}, ${res.longitude}` : undefined],
  ] : [];

  return (
    <div className="space-y-4">
      <form onSubmit={submit} className="flex gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="IP address or domain (e.g. 8.8.8.8 or github.com)"
          className="flex-1 border border-black/[0.08] bg-[var(--color-surface-1)] px-3 py-2.5 text-[14px] text-[var(--color-fg)] placeholder:text-[var(--color-fg-subtle)] focus:border-[var(--color-cat-ip)] focus:outline-none"
        />
        <button type="submit" disabled={busy || !query.trim()}
          className="inline-flex items-center gap-2 bg-[var(--color-fg)] px-5 py-2.5 text-[12px] font-bold uppercase tracking-wider text-[var(--color-canvas)] transition hover:opacity-90 disabled:opacity-50">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} Look up
        </button>
      </form>

      {error && <div className="text-[13px] text-[var(--color-cat-pdf)]">{error}</div>}

      {res && (
        <div className="grid gap-2 sm:grid-cols-2">
          {rows.filter(([, v]) => v).map(([k, v]) => (
            <div key={k} className="flex items-center justify-between gap-3 border border-black/[0.08] bg-[var(--color-surface-1)] px-4 py-2.5">
              <span className="text-[12px] text-[var(--color-fg-muted)]">{k}</span>
              <span className="truncate font-mono text-[12px] text-[var(--color-fg)]">{String(v)}</span>
            </div>
          ))}
        </div>
      )}

      <p className="text-[11px] leading-relaxed text-[var(--color-fg-subtle)]">
        Resolved against our own local database — no third-party API, nothing stored. Location is approximate. IP geolocation by <a href="https://db-ip.com" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-[var(--color-fg-muted)]">DB-IP</a>.
      </p>
    </div>
  );
}
