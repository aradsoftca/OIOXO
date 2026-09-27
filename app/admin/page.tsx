'use client';

import * as React from 'react';
import Link from 'next/link';
import { AdminNav } from '@/components/admin/AdminNav';

interface Stats { users: number; pro: number; openTickets: number; unreadContacts: number; revenue: number }

export default function AdminOverviewPage() {
  const [stats, setStats] = React.useState<Stats | null>(null);
  const [forbidden, setForbidden] = React.useState(false);

  React.useEffect(() => {
    fetch('/api/admin/stats')
      .then((r) => (r.status === 403 ? Promise.reject() : r.json()))
      .then(setStats)
      .catch(() => setForbidden(true));
  }, []);

  if (forbidden) {
    return (
      <div className="grid min-h-[60vh] place-items-center text-center">
        <div>
          <div className="text-[18px] font-bold">Admins only</div>
          <Link href="/" className="mt-3 inline-block text-[13px] font-semibold text-[var(--color-cat-image)] hover:underline">Back home</Link>
        </div>
      </div>
    );
  }

  const cards = [
    { label: 'Total users', value: stats?.users, href: '/admin/users' },
    { label: 'Pro users', value: stats?.pro, href: '/admin/users' },
    { label: 'Open tickets', value: stats?.openTickets, href: '/admin/tickets' },
    { label: 'Unread contacts', value: stats?.unreadContacts, href: '/admin/contact' },
    { label: 'Revenue (USD)', value: stats ? `$${stats.revenue.toFixed(2)}` : undefined, href: '/admin/users' },
  ];

  return (
    <div>
      <h1 className="mb-1 text-[22px] font-bold tracking-tight">Admin</h1>
      <AdminNav />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
        {cards.map((c) => (
          <Link key={c.label} href={c.href} className="border border-black/[0.08] bg-white/60 p-4 transition hover:bg-white">
            <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--color-fg-muted)]">{c.label}</div>
            <div className="mt-2 text-[28px] font-bold tabular-nums tracking-tight text-[var(--color-fg)]">
              {c.value ?? '—'}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
