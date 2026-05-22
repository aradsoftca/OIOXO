'use client';
import { powFetch } from '@/lib/pow-client';

import * as React from 'react';
import { Loader2, Lock, ShieldCheck, ShieldAlert } from 'lucide-react';

interface Cert {
  error?: string;
  subject?: string; issuer?: string; validFrom?: string; validTo?: string;
  daysRemaining?: number; expired?: boolean; authorized?: boolean; authError?: string | null;
  protocol?: string; san?: string[]; serialNumber?: string; chain?: string[];
}

export default function Tool() {
  const [host, setHost] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [res, setRes] = React.useState<Cert | null>(null);

  const run = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!host.trim()) return;
    setBusy(true); setRes(null);
    try {
      const r = await powFetch('/api/net/ssl', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ host }) });
      setRes(await r.json());
    } catch { setRes({ error: 'Request failed.' }); }
    setBusy(false);
  };

  const valid = res && !res.error && !res.expired && res.daysRemaining != null;
  const rows: [string, unknown][] = res && !res.error ? [
    ['Common name', res.subject],
    ['Issuer', res.issuer],
    ['Valid from', res.validFrom],
    ['Valid until', res.validTo],
    ['Days remaining', res.daysRemaining],
    ['TLS protocol', res.protocol],
    ['Trusted chain', res.authorized ? 'Yes' : `No${res.authError ? ` (${res.authError})` : ''}`],
    ['Serial', res.serialNumber],
    ['Chain', res.chain?.join(' → ')],
    ['SANs', res.san?.slice(0, 12).join(', ') + ((res.san?.length ?? 0) > 12 ? ' …' : '')],
  ] : [];

  return (
    <div className="space-y-4">
      <form onSubmit={run} className="flex gap-2">
        <input value={host} onChange={(e) => setHost(e.target.value)} placeholder="domain (e.g. github.com)"
          className="flex-1 border border-black/[0.08] bg-[var(--color-surface-1)] px-3 py-2.5 text-[14px] focus:border-[var(--color-cat-ip)] focus:outline-none" />
        <button type="submit" disabled={busy || !host.trim()}
          className="inline-flex items-center gap-2 bg-[var(--color-fg)] px-5 py-2.5 text-[12px] font-bold uppercase tracking-wider text-[var(--color-canvas)] transition hover:opacity-90 disabled:opacity-50">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />} Check
        </button>
      </form>

      {res?.error && <div className="text-[13px] text-[var(--color-cat-pdf)]">{res.error}</div>}

      {res && !res.error && (
        <>
          <div className={`flex items-center gap-3 border p-4 ${valid ? 'border-green-600/30 bg-green-600/[0.06]' : 'border-[var(--color-cat-pdf)]/30 bg-[var(--color-cat-pdf)]/[0.06]'}`}>
            {valid ? <ShieldCheck className="h-6 w-6 text-green-600" /> : <ShieldAlert className="h-6 w-6 text-[var(--color-cat-pdf)]" />}
            <div className="text-[14px] font-semibold text-[var(--color-fg)]">
              {res.expired ? 'Certificate expired' : `Valid — expires in ${res.daysRemaining} days`}
              {!res.authorized && <span className="ml-1 text-[12px] font-normal text-[var(--color-fg-muted)]">(chain not trusted)</span>}
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {rows.filter(([, v]) => v != null && v !== '').map(([k, v]) => (
              <div key={k} className="flex items-center justify-between gap-3 border border-black/[0.08] bg-[var(--color-surface-1)] px-4 py-2.5">
                <span className="shrink-0 text-[12px] text-[var(--color-fg-muted)]">{k}</span>
                <span className="truncate font-mono text-[12px] text-[var(--color-fg)]">{String(v)}</span>
              </div>
            ))}
          </div>
        </>
      )}
      <p className="text-[11px] text-[var(--color-fg-subtle)]">Read-only TLS handshake from our server. Internal/private addresses are blocked.</p>
    </div>
  );
}
