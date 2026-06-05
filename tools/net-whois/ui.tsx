'use client';
import { powFetch } from '@/lib/pow-client';

import * as React from 'react';
import { Search, Loader2, Copy, Check } from 'lucide-react';
import { ResultGrid } from '@/components/tool/ResultGrid';
import { RecentChips } from '@/components/tool/RecentChips';
import { useQueryHotkeys } from '@/lib/use-query-hotkeys';

interface Whois {
  domain: string;
  server?: string;
  registrar?: string;
  created?: string;
  expires?: string;
  updated?: string;
  nameservers?: string[];
  status?: string[];
  raw?: string;
  error?: string;
}

function fmtDate(s?: string): string {
  if (!s) return '—';
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export default function NetWhoisTool() {
  const [domain, setDomain] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [data, setData] = React.useState<Whois | null>(null);
  const [showRaw, setShowRaw] = React.useState(false);
  const [error, setError] = React.useState('');
  const [copied, setCopied] = React.useState('');

  const copyText = async (v: string, key: string) => {
    try { await navigator.clipboard.writeText(v); setCopied(key); setTimeout(() => setCopied((c) => (c === key ? '' : c)), 1200); } catch { /* */ }
  };

  const rememberRef = React.useRef<(q: string) => void>(() => {});

  const lookup = React.useCallback(async (raw = domain) => {
    const name = raw.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    if (!name) return;
    setBusy(true); setError(''); setData(null); setShowRaw(false);
    try {
      const res = await powFetch('/api/net/whois', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ domain: name }),
      });
      const json: Whois = await res.json();
      if (!res.ok) throw new Error(json.error || `Lookup failed (${res.status})`);
      setData(json);
      rememberRef.current(name);
    } catch (e) {
      setError((e as Error).message || 'Lookup failed.');
    } finally {
      setBusy(false);
    }
  }, [domain]);

  // Paste a domain anywhere to look it up; Esc clears. historyKey → recent chips.
  const { recent, remember, forget } = useQueryHotkeys({
    historyKey: 'whois',
    onPaste: (t) => { setDomain(t); void lookup(t); },
    onClear: () => { setDomain(''); setData(null); setError(''); setShowRaw(false); },
  });
  rememberRef.current = remember;

  const ageYears = (() => {
    if (!data?.created) return null;
    const ms = Date.now() - new Date(data.created).getTime();
    return ms > 0 ? (ms / (365.25 * 864e5)).toFixed(1) : null;
  })();

  return (
    <div className="space-y-4">
      <form onSubmit={(e) => { e.preventDefault(); void lookup(); }} className="flex flex-wrap gap-2">
        <div className="flex min-w-[240px] flex-1 items-center gap-2 border border-black/[0.08] bg-[var(--color-surface-1)] px-3">
          <Search className="h-4 w-4 text-[var(--color-fg-subtle)]" />
          <input value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="example.com"
            className="flex-1 bg-transparent py-2.5 text-[14px] text-[var(--color-fg)] placeholder:text-[var(--color-fg-subtle)] focus:outline-none" />
        </div>
        <button type="submit" disabled={busy || !domain.trim()}
          className="flex items-center gap-2 bg-[var(--color-cat-ip)] px-5 py-2.5 text-[13px] font-bold uppercase tracking-wider text-white transition hover:brightness-110 disabled:bg-black/[0.06] disabled:text-[var(--color-fg-subtle)]">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} Look up
        </button>
      </form>

      <RecentChips recent={recent} onPick={(q) => { setDomain(q); void lookup(q); }} onForget={forget} colorVar="--color-cat-ip" />

      {error && <div className="text-[12px] text-red-600">{error}</div>}

      {data && (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <ResultGrid
                title="Registration"
                columns={1}
                colorVar="--color-cat-ip"
                rows={[
                  { label: 'Domain', value: data.domain },
                  { label: 'Registrar', value: data.registrar },
                  { label: 'Registered', value: data.created ? fmtDate(data.created) : undefined, copyText: data.created },
                  { label: 'Expires', value: data.expires ? fmtDate(data.expires) : undefined, copyText: data.expires },
                  { label: 'Last changed', value: data.updated ? fmtDate(data.updated) : undefined, copyText: data.updated },
                  { label: 'Age', value: ageYears ? `${ageYears} years` : undefined },
                ]}
              />
            </div>
            <div className="space-y-4">
              <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4">
                <div className="flex items-center justify-between">
                  <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Nameservers</div>
                  {(data.nameservers ?? []).length > 0 && (
                    <button type="button" onClick={() => copyText(data.nameservers!.join('\n'), 'ns')}
                      className="inline-flex items-center gap-1 text-[11px] text-[var(--color-fg-muted)] transition hover:text-[var(--color-fg)]">
                      {copied === 'ns' ? <Check className="h-3 w-3 text-green-600" /> : <Copy className="h-3 w-3" />}
                    </button>
                  )}
                </div>
                <ul className="mt-2 space-y-1 font-mono text-[12px] text-[var(--color-fg)]">
                  {(data.nameservers ?? []).length ? data.nameservers!.map((n, i) => (
                    <li key={i}>
                      <button type="button" onClick={() => copyText(n, n)}
                        className="group inline-flex items-center gap-1.5 text-left transition hover:text-[var(--color-cat-ip)]">
                        {n}
                        {copied === n ? <Check className="h-3 w-3 text-green-600" /> : <Copy className="h-3 w-3 opacity-0 transition group-hover:opacity-100" />}
                      </button>
                    </li>
                  )) : <li className="text-[var(--color-fg-subtle)]">—</li>}
                </ul>
              </div>
              <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4">
                <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Status</div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {(data.status ?? []).length ? data.status!.map((s) => (
                    <span key={s} className="bg-black/[0.06] px-2 py-0.5 text-[11px] text-[var(--color-fg)]">{s}</span>
                  )) : <span className="text-[12px] text-[var(--color-fg-subtle)]">—</span>}
                </div>
              </div>
            </div>
          </div>

          {data.raw && (
            <div>
              <button type="button" onClick={() => setShowRaw((v) => !v)}
                className="text-[12px] font-medium text-[var(--color-fg-muted)] underline-offset-2 hover:text-[var(--color-fg)] hover:underline">
                {showRaw ? 'Hide' : 'Show'} raw WHOIS record
              </button>
              {showRaw && (
                <pre className="mt-2 max-h-80 overflow-auto border border-black/[0.08] bg-[var(--color-surface-1)] p-3 font-mono text-[11px] leading-relaxed text-[var(--color-fg)]">{data.raw}</pre>
              )}
            </div>
          )}
        </>
      )}

      <p className="text-[11px] leading-relaxed text-[var(--color-fg-subtle)]">
        Queried directly from the authoritative registry over WHOIS by our own server — no third-party API. Some registries (and domains under privacy) reveal limited fields.
      </p>
    </div>
  );
}
