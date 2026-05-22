'use client';

import * as React from 'react';
import { AdminNav } from '@/components/admin/AdminNav';

interface Row { category: string; dailyLimit: number; default: number }

export default function AdminLimitsPage() {
  const [rows, setRows] = React.useState<Row[] | null>(null);
  const [forbidden, setForbidden] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [saved, setSaved] = React.useState(false);

  React.useEffect(() => {
    fetch('/api/admin/limits')
      .then((r) => (r.status === 403 ? Promise.reject() : r.json()))
      .then((d) => setRows(d.categories))
      .catch(() => setForbidden(true));
  }, []);

  const set = (cat: string, v: number) =>
    setRows((rs) => rs?.map((r) => (r.category === cat ? { ...r, dailyLimit: v } : r)) ?? rs);

  async function save() {
    if (!rows) return;
    setSaving(true); setSaved(false);
    const limits = Object.fromEntries(rows.map((r) => [r.category, r.dailyLimit]));
    const res = await fetch('/api/admin/limits', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ limits }) });
    setSaving(false);
    if (res.ok) { setSaved(true); setTimeout(() => setSaved(false), 2000); }
  }

  if (forbidden) return <div className="grid min-h-[60vh] place-items-center text-[18px] font-bold">Admins only</div>;

  return (
    <div>
      <h1 className="mb-1 text-[22px] font-bold tracking-tight">Admin</h1>
      <AdminNav />
      <div className="max-w-xl">
        <h2 className="text-[16px] font-bold tracking-tight">Free-tier daily limits</h2>
        <p className="mt-1 text-[13px] text-[var(--color-fg-muted)]">
          Free actions per category, per day, before the 30-second reward wait and the upgrade prompt.
          Changes take effect within a minute. Pro users are always unlimited.
        </p>

        <div className="mt-4 divide-y divide-black/[0.06] border border-black/[0.08] bg-[var(--color-surface-1)]">
          {rows === null && <div className="px-4 py-4 text-[var(--color-fg-muted)]">Loading…</div>}
          {rows?.map((r) => (
            <div key={r.category} className="flex items-center justify-between px-4 py-3">
              <div>
                <div className="text-[14px] font-semibold capitalize text-[var(--color-fg)]">{r.category}</div>
                <div className="text-[11px] text-[var(--color-fg-subtle)]">default {r.default}</div>
              </div>
              <input
                type="number" min={0} max={100000} value={r.dailyLimit}
                onChange={(e) => set(r.category, Math.max(0, parseInt(e.target.value, 10) || 0))}
                className="w-24 border border-black/[0.1] bg-white px-2 py-1.5 text-right font-mono text-[14px] focus:border-[var(--color-cat-image)] focus:outline-none"
              />
            </div>
          ))}
        </div>

        <div className="mt-4 flex items-center gap-3">
          <button onClick={save} disabled={saving || !rows}
            className="bg-[var(--color-fg)] px-5 py-2.5 text-[12px] font-bold uppercase tracking-wider text-[var(--color-canvas)] transition hover:opacity-90 disabled:opacity-50">
            {saving ? 'Saving…' : 'Save limits'}
          </button>
          {saved && <span className="text-[13px] font-semibold text-green-600">Saved ✓</span>}
        </div>
      </div>
    </div>
  );
}
