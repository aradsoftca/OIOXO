'use client';

import * as React from 'react';
import { ArrowLeftRight, Loader2, TrendingUp } from 'lucide-react';

const NAMES: Record<string, string> = {
  EUR: 'Euro', USD: 'US Dollar', GBP: 'British Pound', JPY: 'Japanese Yen', CHF: 'Swiss Franc',
  AUD: 'Australian Dollar', CAD: 'Canadian Dollar', CNY: 'Chinese Yuan', HKD: 'Hong Kong Dollar',
  NZD: 'New Zealand Dollar', SEK: 'Swedish Krona', KRW: 'South Korean Won', SGD: 'Singapore Dollar',
  NOK: 'Norwegian Krone', MXN: 'Mexican Peso', INR: 'Indian Rupee', BRL: 'Brazilian Real',
  ZAR: 'South African Rand', TRY: 'Turkish Lira', PLN: 'Polish Zloty', DKK: 'Danish Krone',
  CZK: 'Czech Koruna', HUF: 'Hungarian Forint', ILS: 'Israeli Shekel', THB: 'Thai Baht',
  IDR: 'Indonesian Rupiah', MYR: 'Malaysian Ringgit', PHP: 'Philippine Peso', RON: 'Romanian Leu',
  BGN: 'Bulgarian Lev', ISK: 'Icelandic Krona',
};

interface Fx { base: 'EUR'; date: string; rates: Record<string, number>; stale?: boolean }

function fmtMoney(n: number): string {
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: n < 1 ? 6 : 2 });
}

export default function CurrencyConverterTool() {
  const [fx, setFx] = React.useState<Fx | null>(null);
  const [error, setError] = React.useState('');
  const [amount, setAmount] = React.useState('100');
  const [from, setFrom] = React.useState('USD');
  const [to, setTo] = React.useState('EUR');

  React.useEffect(() => {
    let on = true;
    fetch('/api/fx')
      .then((r) => r.json())
      .then((d: Fx & { error?: string }) => { if (!on) return; if (d.error) setError(d.error); else setFx(d); })
      .catch(() => on && setError('Could not load exchange rates.'));
    return () => { on = false; };
  }, []);

  const codes = React.useMemo(() => fx ? Object.keys(fx.rates).sort((a, b) => (a === 'EUR' ? -1 : b === 'EUR' ? 1 : a.localeCompare(b))) : [], [fx]);

  // Convert through EUR base: amount_from / rate_from * rate_to.
  const convert = (amt: number, f: string, t: string): number => {
    if (!fx) return NaN;
    const rf = fx.rates[f], rt = fx.rates[t];
    if (!rf || !rt) return NaN;
    return (amt / rf) * rt;
  };

  const amt = parseFloat(amount) || 0;
  const result = fx ? convert(amt, from, to) : NaN;
  const unitRate = fx ? convert(1, from, to) : NaN;

  const swap = () => { setFrom(to); setTo(from); };

  const Picker = ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <select value={value} onChange={(e) => onChange(e.target.value)}
      className="w-full border border-black/[0.08] bg-[var(--color-surface-1)] px-3 py-3 text-[14px] font-medium text-[var(--color-fg)] focus:border-[var(--color-cat-finance)] focus:outline-none">
      {codes.map((c) => <option key={c} value={c}>{c} — {NAMES[c] ?? c}</option>)}
    </select>
  );

  if (error && !fx) {
    return <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-8 text-center text-[14px] text-[var(--color-fg-muted)]">{error}</div>;
  }

  return (
    <div className="mx-auto max-w-xl space-y-5">
      {!fx ? (
        <div className="flex items-center justify-center gap-2 py-16 text-[var(--color-fg-muted)]"><Loader2 className="h-5 w-5 animate-spin" /> Loading rates…</div>
      ) : (
        <>
          <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-5">
            <label className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-fg-muted)]">Amount</label>
            <input type="number" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)}
              className="mt-2 w-full bg-transparent font-mono text-[clamp(28px,6vw,44px)] font-bold tracking-tight text-[var(--color-fg)] focus:outline-none" />
          </div>

          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
            <div>
              <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-fg-muted)]">From</div>
              <Picker value={from} onChange={setFrom} />
            </div>
            <button type="button" onClick={swap} title="Swap"
              className="mt-5 grid h-11 w-11 place-items-center border border-black/[0.08] bg-[var(--color-surface-1)] text-[var(--color-cat-finance)] transition hover:bg-[var(--color-surface-2)]">
              <ArrowLeftRight className="h-4 w-4" />
            </button>
            <div>
              <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-fg-muted)]">To</div>
              <Picker value={to} onChange={setTo} />
            </div>
          </div>

          <div className="border border-[var(--color-cat-finance)] bg-[var(--color-cat-finance)]/[0.06] p-5 text-center">
            <div className="text-[13px] text-[var(--color-fg-muted)]">{fmtMoney(amt)} {from} =</div>
            <div className="mt-1 font-mono text-[clamp(26px,6vw,40px)] font-bold tracking-tight text-[var(--color-fg)]">
              {fmtMoney(result)} <span className="text-[var(--color-cat-finance)]">{to}</span>
            </div>
            <div className="mt-2 flex items-center justify-center gap-1.5 text-[12px] text-[var(--color-fg-muted)]">
              <TrendingUp className="h-3.5 w-3.5" /> 1 {from} = {fmtMoney(unitRate)} {to}
            </div>
          </div>

          <p className="text-center text-[11px] text-[var(--color-fg-subtle)]">
            Daily reference rates from the European Central Bank{fx.date ? ` (${fx.date})` : ''}{fx.stale ? ' · cached' : ''}. For information only — not a live trading rate. Fetched and cached by our own server.
          </p>
        </>
      )}
    </div>
  );
}
