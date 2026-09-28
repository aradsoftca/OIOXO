'use client';

import * as React from 'react';
import { AdminNav } from '@/components/admin/AdminNav';

/** Admin: the anonymous upgrade funnel (daily counters from /api/funnel). */
const ORDER = ['limit_hit', 'size_hit', 'nudge_shown', 'nudge_click', 'pricing_view', 'checkout_start', 'paid'];
const LABEL: Record<string, string> = {
  limit_hit: 'Daily limit reached',
  size_hit: 'File too big (free cap)',
  nudge_shown: '"Remove mark with Pro" shown',
  nudge_click: '…clicked Go Pro',
  pricing_view: 'Pricing page views',
  checkout_start: 'Checkouts started',
  paid: 'Payments completed',
};

export default function FunnelAdmin() {
  const [days, setDays] = React.useState(30);
  const [data, setData] = React.useState<{ totals: Record<string, number>; since: string } | null>(null);
  const [error, setError] = React.useState('');
  React.useEffect(() => {
    setError('');
    fetch(`/api/funnel?days=${days}`)
      .then(async (r) => { if (!r.ok) throw new Error(r.status === 403 ? 'Admins only.' : `HTTP ${r.status}`); return r.json(); })
      .then(setData)
      .catch((e) => setError(e.message));
  }, [days]);
  const max = Math.max(1, ...ORDER.map((k) => data?.totals[k] ?? 0));
  return (
    <div className="mx-auto w-[min(900px,96vw)] space-y-6 py-6">
      <AdminNav />
      <h1 className="text-[24px] font-bold">Upgrade funnel</h1>
      <p className="text-[13px] text-[var(--color-fg-muted)]">Anonymous daily counters — no user, IP or cookie is stored.</p>
      <div className="flex gap-2">
        {[7, 30, 90].map((d) => (
          <button key={d} type="button" onClick={() => setDays(d)} className={`min-h-[40px] border px-3 text-[13px] ${d === days ? 'bg-[var(--color-fg)] text-[var(--color-canvas)]' : ''}`}>
            {d} days
          </button>
        ))}
      </div>
      {error && <div className="text-[13px] text-red-600">{error}</div>}
      {data && (
        <table className="w-full text-[14px]">
          <tbody>
            {ORDER.map((k) => {
              const n = data.totals[k] ?? 0;
              return (
                <tr key={k} className="border-b border-black/[0.06]">
                  <td className="py-2 pr-4">{LABEL[k]}</td>
                  <td className="w-full py-2"><div className="h-3 bg-[var(--brand-1)]" style={{ width: `${(n / max) * 100}%` }} /></td>
                  <td className="py-2 pl-4 text-right font-mono">{n}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
