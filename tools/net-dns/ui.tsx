'use client';
import { powFetch } from '@/lib/pow-client';

import * as React from 'react';
import { Search, Loader2, Copy, Check } from 'lucide-react';
import { cn } from '@/lib/cn';
import { RecentChips } from '@/components/tool/RecentChips';
import { useQueryHotkeys } from '@/lib/use-query-hotkeys';

const TYPES = ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'SOA', 'CAA', 'SRV', 'PTR'] as const;
type RecordType = typeof TYPES[number];

interface Answer { type: string; TTL: number; data: string }

export default function NetDnsTool() {
  const [domain, setDomain] = React.useState('');
  const [type, setType] = React.useState<RecordType>('A');
  const [busy, setBusy] = React.useState(false);
  const [answers, setAnswers] = React.useState<Answer[] | null>(null);
  const [error, setError] = React.useState('');
  const [copied, setCopied] = React.useState('');

  const rememberRef = React.useRef<(q: string) => void>(() => {});

  const lookup = async (d = domain, t = type) => {
    const name = d.trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    if (!name) return;
    setBusy(true); setError(''); setAnswers(null);
    try {
      const res = await powFetch('/api/net/dns', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, type: t }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `Lookup failed (${res.status})`);
      setAnswers((json.answers ?? []) as Answer[]);
      rememberRef.current(name);
    } catch (e) {
      setError((e as Error).message || 'Lookup failed. Check the domain and try again.');
    } finally {
      setBusy(false);
    }
  };

  const copy = async (v: string) => { await navigator.clipboard.writeText(v); setCopied(v); setTimeout(() => setCopied(''), 1200); };

  // Paste a domain anywhere to resolve it; Esc clears the box and results.
  // historyKey surfaces one-click "recent lookups" chips.
  const { recent, remember, forget } = useQueryHotkeys({
    historyKey: 'dns',
    onPaste: (t) => { setDomain(t); void lookup(t, type); },
    onClear: () => { setDomain(''); setAnswers(null); setError(''); },
  });
  rememberRef.current = remember;

  // Copy every record (type / value / TTL) as aligned plain text.
  const copyAll = async () => {
    if (!answers?.length) return;
    const text = answers.map((a) => `${a.type}\t${a.data}\t${a.TTL}s`).join('\n');
    try { await navigator.clipboard.writeText(text); setCopied('__all__'); setTimeout(() => setCopied((c) => (c === '__all__' ? '' : c)), 1400); } catch { /* */ }
  };

  return (
    <div className="space-y-4">
      <form onSubmit={(e) => { e.preventDefault(); void lookup(); }} className="flex flex-wrap gap-2">
        <div className="flex min-w-[240px] flex-1 items-center gap-2 border border-black/[0.08] bg-[var(--color-surface-1)] px-3">
          <Search className="h-4 w-4 text-[var(--color-fg-subtle)]" />
          <input value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="example.com"
            className="flex-1 bg-transparent py-2.5 text-[14px] text-[var(--color-fg)] placeholder:text-[var(--color-fg-subtle)] focus:outline-none" />
        </div>
        <select value={type} onChange={(e) => { setType(e.target.value as RecordType); if (domain.trim()) void lookup(domain, e.target.value as RecordType); }}
          className="border border-black/[0.08] bg-[var(--color-surface-1)] px-3 py-2.5 text-[13px] font-mono text-[var(--color-fg)] focus:outline-none">
          {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <button type="submit" disabled={busy || !domain.trim()}
          className="flex items-center gap-2 bg-[var(--color-cat-ip)] px-5 py-2.5 text-[13px] font-bold uppercase tracking-wider text-white transition hover:brightness-110 disabled:bg-black/[0.06] disabled:text-[var(--color-fg-subtle)]">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} Lookup
        </button>
      </form>

      <RecentChips recent={recent} onPick={(q) => { setDomain(q); void lookup(q, type); }} onForget={forget} colorVar="--color-cat-ip" />

      {error && <div className="text-[12px] text-red-600">{error}</div>}

      {answers && (
        answers.length === 0 ? (
          <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-6 text-center text-[13px] text-[var(--color-fg-subtle)]">
            No {type} records found for that domain.
          </div>
        ) : (
          <div className="border border-black/[0.08] bg-[var(--color-surface-1)]">
            <div className="flex items-center justify-between border-b border-black/[0.06] px-4 py-1.5">
              <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--color-fg-muted)]">{answers.length} {type} record{answers.length === 1 ? '' : 's'}</span>
              <button type="button" onClick={copyAll}
                className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[var(--color-fg-muted)] transition hover:text-[var(--color-fg)]">
                {copied === '__all__' ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
                {copied === '__all__' ? 'Copied' : 'Copy all'}
              </button>
            </div>
            <div className="grid grid-cols-[80px_1fr_80px] gap-2 border-b border-black/[0.06] px-4 py-2 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--color-fg-muted)]">
              <span>Type</span><span>Value</span><span className="text-right">TTL</span>
            </div>
            {answers.map((a, i) => (
              <button key={i} type="button" onClick={() => copy(a.data)}
                className="grid w-full grid-cols-[80px_1fr_80px] items-center gap-2 border-b border-black/[0.04] px-4 py-2.5 text-left last:border-b-0 hover:bg-[var(--color-surface-2)]">
                <span className="font-mono text-[11px] font-bold text-[var(--color-cat-ip)]">{a.type}</span>
                <span className="flex items-center gap-2 truncate font-mono text-[12px] text-[var(--color-fg)]">
                  {a.data}
                  {copied === a.data ? <Check className="h-3 w-3 text-green-600" /> : <Copy className="h-3 w-3 text-[var(--color-fg-subtle)] opacity-0 group-hover:opacity-100" />}
                </span>
                <span className="text-right font-mono text-[11px] text-[var(--color-fg-muted)]">{a.TTL}s</span>
              </button>
            ))}
          </div>
        )
      )}

      <p className={cn('text-[11px] leading-relaxed text-[var(--color-fg-subtle)]', answers || error ? '' : 'pt-2')}>
        Records are resolved on our own server — no third-party API. Nothing is stored.
      </p>
    </div>
  );
}
