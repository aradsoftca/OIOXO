'use client';
import * as React from 'react';
import { Copy, Check } from 'lucide-react';
import { totp } from '@/engines/dev/crypto';
import { cn } from '@/lib/cn';

export default function Tool() {
  const [secret, setSecret] = React.useState('');
  const [digits, setDigits] = React.useState(6);
  const [period, setPeriod] = React.useState(30);
  const [code, setCode] = React.useState('');
  const [remaining, setRemaining] = React.useState(30);
  const [error, setError] = React.useState('');
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    if (!secret.trim()) { setCode(''); setError(''); setRemaining(period); return; }
    let mounted = true;
    const tick = async () => {
      try {
        const r = await totp(secret, { digits, period });
        if (!mounted) return;
        setCode(r.code);
        setRemaining(r.secondsRemaining);
        setError('');
      } catch (e) {
        if (!mounted) return;
        setError(e instanceof Error ? e.message : String(e));
      }
    };
    void tick();
    const id = setInterval(tick, 1000);
    return () => { mounted = false; clearInterval(id); };
  }, [secret, digits, period]);

  const copy = async () => {
    if (!code) return;
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };

  const ratio = remaining / period;

  return (
    <div className="grid gap-6 md:grid-cols-[1fr_320px]">
      <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-6">
        <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Current code</div>
        <div className="mt-3 flex items-baseline gap-3">
          <button
            type="button"
            onClick={copy}
            disabled={!code}
            className="group flex items-center gap-3 text-left"
          >
            <span className="font-mono text-[68px] font-bold leading-none tracking-[0.05em] tabular-nums text-[var(--color-cat-dev)]">
              {code ? code.replace(/(\d{3})(?=\d)/g, '$1 ') : '—'.repeat(digits)}
            </span>
            {code && (copied
              ? <Check className="h-5 w-5 text-[var(--color-cat-dev)]" />
              : <Copy className="h-5 w-5 text-[var(--color-fg-subtle)] transition group-hover:text-[var(--color-fg)]" />)}
          </button>
        </div>

        <div className="mt-6">
          <div className="flex items-baseline justify-between">
            <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--color-fg-subtle)]">Window</span>
            <span className={cn(
              'font-mono text-[13px] font-semibold tabular-nums',
              remaining <= 5 ? 'text-[oklch(58%_0.22_22)]' : 'text-[var(--color-fg)]',
            )}>{remaining}s</span>
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden bg-black/[0.06]">
            <div
              className="h-full transition-[width] duration-1000 ease-linear"
              style={{ width: `${ratio * 100}%`, background: `var(--color-cat-dev)` }}
            />
          </div>
        </div>

        {error && <div className="mt-4 text-[12px] text-[oklch(58%_0.22_22)]">{error}</div>}
      </div>

      <aside className="space-y-3">
        <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4 space-y-3">
          <label className="block">
            <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Secret (base32)</div>
            <input
              type="text"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              placeholder="JBSWY3DPEHPK3PXP"
              className="mt-2 w-full border-b-2 border-black/[0.1] bg-transparent py-1.5 font-mono text-[14px] text-[var(--color-fg)] outline-none focus:border-[var(--color-cat-dev)]"
            />
          </label>
          <label className="block">
            <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Digits</div>
            <input
              type="number"
              value={digits}
              onChange={(e) => setDigits(Math.max(6, Math.min(8, Number(e.target.value) || 6)))}
              className="mt-2 w-full border border-black/[0.08] bg-transparent px-2 py-1.5 font-mono text-[13px] text-[var(--color-fg)] outline-none focus:border-[var(--color-cat-dev)]"
            />
          </label>
          <label className="block">
            <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Period (seconds)</div>
            <input
              type="number"
              value={period}
              onChange={(e) => setPeriod(Math.max(15, Math.min(120, Number(e.target.value) || 30)))}
              className="mt-2 w-full border border-black/[0.08] bg-transparent px-2 py-1.5 font-mono text-[13px] text-[var(--color-fg)] outline-none focus:border-[var(--color-cat-dev)]"
            />
          </label>
        </div>
      </aside>
    </div>
  );
}
