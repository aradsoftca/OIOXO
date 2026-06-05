'use client';
import { powFetch } from '@/lib/pow-client';

import * as React from 'react';
import { Loader2, Lock, ShieldCheck, ShieldAlert } from 'lucide-react';
import { ResultGrid } from '@/components/tool/ResultGrid';
import { RecentChips } from '@/components/tool/RecentChips';
import { useQueryHotkeys } from '@/lib/use-query-hotkeys';

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

  const rememberRef = React.useRef<(q: string) => void>(() => {});

  const check = React.useCallback(async (target: string) => {
    if (!target.trim()) return;
    setBusy(true); setRes(null);
    try {
      const r = await powFetch('/api/net/ssl', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ host: target }) });
      const data: Cert = await r.json();
      setRes(data);
      if (!data.error) rememberRef.current(target.trim());
    } catch { setRes({ error: 'Request failed.' }); }
    setBusy(false);
  }, []);

  const run = (e: React.FormEvent) => { e.preventDefault(); void check(host); };

  // Paste a domain anywhere to check it; Esc clears. historyKey → recent chips.
  const { recent, remember, forget } = useQueryHotkeys({
    historyKey: 'ssl',
    onPaste: (t) => { setHost(t); void check(t); },
    onClear: () => { setHost(''); setRes(null); },
  });
  rememberRef.current = remember;

  const valid = res && !res.error && !res.expired && res.daysRemaining != null;
  const rows = res && !res.error ? [
    { label: 'Common name', value: res.subject },
    { label: 'Issuer', value: res.issuer },
    { label: 'Valid from', value: res.validFrom },
    { label: 'Valid until', value: res.validTo },
    { label: 'Days remaining', value: res.daysRemaining },
    { label: 'TLS protocol', value: res.protocol },
    { label: 'Trusted chain', value: res.authorized ? 'Yes' : `No${res.authError ? ` (${res.authError})` : ''}` },
    { label: 'Serial', value: res.serialNumber },
    { label: 'Chain', value: res.chain?.join(' → ') },
    { label: 'SANs', value: res.san?.length ? res.san.slice(0, 12).join(', ') + ((res.san.length) > 12 ? ' …' : '') : undefined, copyText: res.san?.join(', ') },
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

      <RecentChips recent={recent} onPick={(q) => { setHost(q); void check(q); }} onForget={forget} colorVar="--color-cat-ip" />

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
          <ResultGrid rows={rows} colorVar="--color-cat-ip" />
        </>
      )}
      <p className="text-[11px] text-[var(--color-fg-subtle)]">Read-only TLS handshake from our server. Internal/private addresses are blocked.</p>
    </div>
  );
}
