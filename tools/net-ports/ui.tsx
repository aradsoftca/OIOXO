'use client';
import { powFetch } from '@/lib/pow-client';

import * as React from 'react';
import { Loader2, Plug } from 'lucide-react';

const NAMES: Record<number, string> = {
  21: 'FTP', 22: 'SSH', 25: 'SMTP', 53: 'DNS', 80: 'HTTP', 110: 'POP3', 143: 'IMAP',
  443: 'HTTPS', 3306: 'MySQL', 3389: 'RDP', 5432: 'Postgres', 6379: 'Redis', 8080: 'HTTP-alt', 8443: 'HTTPS-alt',
};
interface R { port: number; open: boolean }

export default function Tool() {
  const [host, setHost] = React.useState('');
  const [portsStr, setPortsStr] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [res, setRes] = React.useState<R[] | null>(null);
  const [error, setError] = React.useState('');

  const run = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!host.trim()) return;
    setBusy(true); setRes(null); setError('');
    const ports = portsStr.split(',').map((s) => parseInt(s.trim(), 10)).filter((n) => n >= 1 && n <= 65535);
    try {
      const r = await powFetch('/api/net/ports', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ host, ports }),
      });
      const d = await r.json();
      if (!r.ok) setError(d.error || 'Failed.'); else setRes(d.results);
    } catch { setError('Request failed.'); }
    setBusy(false);
  };

  return (
    <div className="space-y-4">
      <form onSubmit={run} className="space-y-2">
        <input value={host} onChange={(e) => setHost(e.target.value)} placeholder="host or IP (e.g. example.com)"
          className="w-full border border-black/[0.08] bg-[var(--color-surface-1)] px-3 py-2.5 text-[14px] focus:border-[var(--color-cat-ip)] focus:outline-none" />
        <div className="flex gap-2">
          <input value={portsStr} onChange={(e) => setPortsStr(e.target.value)} placeholder="ports (optional, comma-sep, up to 10) — blank = common ports"
            className="flex-1 border border-black/[0.08] bg-[var(--color-surface-1)] px-3 py-2.5 text-[13px] focus:border-[var(--color-cat-ip)] focus:outline-none" />
          <button type="submit" disabled={busy || !host.trim()}
            className="inline-flex items-center gap-2 bg-[var(--color-fg)] px-5 py-2.5 text-[12px] font-bold uppercase tracking-wider text-[var(--color-canvas)] transition hover:opacity-90 disabled:opacity-50">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plug className="h-4 w-4" />} Check
          </button>
        </div>
      </form>

      {error && <div className="text-[13px] text-[var(--color-cat-pdf)]">{error}</div>}

      {res && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {res.map((r) => (
            <div key={r.port} className="flex items-center justify-between border border-black/[0.08] bg-[var(--color-surface-1)] px-3 py-2">
              <span className="font-mono text-[13px] text-[var(--color-fg)]">{r.port}<span className="ml-1 text-[11px] text-[var(--color-fg-muted)]">{NAMES[r.port] ?? ''}</span></span>
              <span className={`text-[11px] font-bold uppercase tracking-wider ${r.open ? 'text-green-600' : 'text-[var(--color-fg-subtle)]'}`}>{r.open ? 'open' : 'closed'}</span>
            </div>
          ))}
        </div>
      )}
      <p className="text-[11px] text-[var(--color-fg-subtle)]">TCP connectivity check from our server (single host, ≤10 ports, rate-limited). Internal/private addresses are blocked.</p>
    </div>
  );
}
