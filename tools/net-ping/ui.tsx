'use client';
import { powFetch } from '@/lib/pow-client';

import * as React from 'react';
import { Loader2, Activity } from 'lucide-react';

interface Res {
  error?: string; addr?: string; port?: number;
  samples?: (number | null)[]; min?: number | null; avg?: number | null; max?: number | null; loss?: number;
}

export default function Tool() {
  const [host, setHost] = React.useState('');
  const [port, setPort] = React.useState('443');
  const [busy, setBusy] = React.useState(false);
  const [res, setRes] = React.useState<Res | null>(null);

  const run = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!host.trim()) return;
    setBusy(true); setRes(null);
    try {
      const r = await powFetch('/api/net/ping', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ host, port: Number(port) || 443 }),
      });
      setRes(await r.json());
    } catch { setRes({ error: 'Request failed.' }); }
    setBusy(false);
  };

  return (
    <div className="space-y-4">
      <form onSubmit={run} className="flex gap-2">
        <input value={host} onChange={(e) => setHost(e.target.value)} placeholder="host or IP (e.g. 1.1.1.1)"
          className="flex-1 border border-black/[0.08] bg-[var(--color-surface-1)] px-3 py-2.5 text-[14px] focus:border-[var(--color-cat-ip)] focus:outline-none" />
        <input value={port} onChange={(e) => setPort(e.target.value)} placeholder="port" inputMode="numeric"
          className="w-20 border border-black/[0.08] bg-[var(--color-surface-1)] px-3 py-2.5 text-center text-[14px] focus:border-[var(--color-cat-ip)] focus:outline-none" />
        <button type="submit" disabled={busy || !host.trim()}
          className="inline-flex items-center gap-2 bg-[var(--color-fg)] px-5 py-2.5 text-[12px] font-bold uppercase tracking-wider text-[var(--color-canvas)] transition hover:opacity-90 disabled:opacity-50">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Activity className="h-4 w-4" />} Ping
        </button>
      </form>

      {res?.error && <div className="text-[13px] text-[var(--color-cat-pdf)]">{res.error}</div>}

      {res && !res.error && (
        <>
          <div className="grid grid-cols-4 gap-2">
            {[['min', res.min], ['avg', res.avg], ['max', res.max], ['loss', res.loss]].map(([k, v]) => (
              <div key={k as string} className="border border-black/[0.08] bg-[var(--color-surface-1)] p-3 text-center">
                <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--color-fg-muted)]">{k}</div>
                <div className="mt-1 font-mono text-[20px] font-bold tabular-nums text-[var(--color-fg)]">
                  {v == null ? '—' : k === 'loss' ? `${v}%` : `${v}ms`}
                </div>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {res.samples?.map((s, i) => (
              <span key={i} className="bg-black/[0.06] px-2 py-0.5 font-mono text-[11px] text-[var(--color-fg)]">{s == null ? 'timeout' : `${s}ms`}</span>
            ))}
          </div>
        </>
      )}
      <p className="text-[11px] text-[var(--color-fg-subtle)]">TCP connect latency from our server (ICMP needs raw sockets and is often blocked). Internal/private addresses are blocked.</p>
    </div>
  );
}
