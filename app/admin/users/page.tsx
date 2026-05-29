'use client';

import * as React from 'react';
import Link from 'next/link';
import { AdminNav } from '@/components/admin/AdminNav';

interface U {
  id: string; email: string | null; name: string | null; plan: string; role: string;
  subscriptionStatus: string; stripeCustomerId: string | null; createdAt: string; lastLoginAt: string | null;
}

const PLANS = ['FREE', 'PRO', 'BUSINESS'];
const ROLES = ['USER', 'ADMIN'];
const SUBS = ['ACTIVE', 'INACTIVE', 'CANCELLED', 'PAST_DUE'];

export default function AdminUsersPage() {
  const [users, setUsers] = React.useState<U[] | null>(null);
  const [forbidden, setForbidden] = React.useState(false);
  const [q, setQ] = React.useState('');
  const [savingId, setSavingId] = React.useState<string | null>(null);

  const load = React.useCallback((query: string) => {
    fetch(`/api/admin/users${query ? `?q=${encodeURIComponent(query)}` : ''}`)
      .then((r) => (r.status === 403 ? Promise.reject() : r.json()))
      .then((d) => setUsers(d.users))
      .catch(() => setForbidden(true));
  }, []);

  React.useEffect(() => { load(''); }, [load]);

  async function update(id: string, patch: Partial<Pick<U, 'plan' | 'role' | 'subscriptionStatus'>>) {
    setSavingId(id);
    try {
      const res = await fetch(`/api/admin/users/${id}`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(patch),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        alert(d?.error || 'Update failed');
        return;
      }
      setUsers((prev) => prev?.map((u) => (u.id === id ? { ...u, ...patch } : u)) ?? prev);
    } catch {
      // Without this catch a network blip surfaced as an unhandled promise
      // rejection and the row stayed greyed out indefinitely.
      alert('Network error — change not saved.');
    } finally {
      setSavingId(null);
    }
  }

  if (forbidden) {
    return (
      <div className="grid min-h-[60vh] place-items-center text-center">
        <div className="text-[18px] font-bold">Admins only</div>
      </div>
    );
  }

  const sel = 'border border-black/[0.08] bg-white/70 px-2 py-1 text-[12px] focus:border-[var(--color-cat-image)] focus:outline-none';

  return (
    <div>
      <h1 className="mb-1 text-[22px] font-bold tracking-tight">Admin</h1>
      <AdminNav />
      <form
        onSubmit={(e) => { e.preventDefault(); load(q); }}
        className="mb-4 flex gap-2"
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search email or name…"
          className="w-[min(360px,70vw)] border border-black/[0.08] bg-white/60 px-3 py-2 text-[13px] focus:border-[var(--color-cat-image)] focus:outline-none"
        />
        <button className="bg-[var(--color-fg)] px-4 py-2 text-[12px] font-bold uppercase tracking-wider text-[var(--color-canvas)]">Search</button>
      </form>

      <div className="overflow-x-auto border border-black/[0.06]">
        <table className="w-full text-left text-[12px]">
          <thead className="bg-black/[0.03] text-[10px] font-bold uppercase tracking-wider text-[var(--color-fg-muted)]">
            <tr>
              <th className="px-3 py-2">User</th>
              <th className="px-3 py-2">Plan</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Role</th>
              <th className="px-3 py-2">Billing</th>
            </tr>
          </thead>
          <tbody>
            {users === null && <tr><td colSpan={5} className="px-3 py-4 text-[var(--color-fg-muted)]">Loading…</td></tr>}
            {users?.length === 0 && <tr><td colSpan={5} className="px-3 py-4 text-[var(--color-fg-muted)]">No users.</td></tr>}
            {users?.map((u) => (
              <tr key={u.id} className={`border-t border-black/[0.05] ${savingId === u.id ? 'opacity-50' : ''}`}>
                <td className="px-3 py-2">
                  <div className="font-semibold text-[var(--color-fg)]">{u.name || '—'}</div>
                  <div className="text-[var(--color-fg-muted)]">{u.email}</div>
                </td>
                <td className="px-3 py-2">
                  <select className={sel} value={u.plan} onChange={(e) => update(u.id, { plan: e.target.value })}>
                    {PLANS.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                </td>
                <td className="px-3 py-2">
                  <select className={sel} value={u.subscriptionStatus} onChange={(e) => update(u.id, { subscriptionStatus: e.target.value })}>
                    {SUBS.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </td>
                <td className="px-3 py-2">
                  <select className={sel} value={u.role} onChange={(e) => update(u.id, { role: e.target.value })}>
                    {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </td>
                <td className="px-3 py-2 text-[var(--color-fg-muted)]">{u.stripeCustomerId ? 'Stripe' : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-[11px] text-[var(--color-fg-muted)]">
        Changing a plan to PRO grants unlimited access immediately (gate bypass). Role ADMIN grants
        access to this dashboard. Changes are recorded in the audit log.
      </p>
    </div>
  );
}
