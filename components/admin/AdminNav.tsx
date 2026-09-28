'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
  { href: '/admin', label: 'Overview' },
  { href: '/admin/users', label: 'Users' },
  { href: '/admin/tickets', label: 'Tickets' },
  { href: '/admin/contact', label: 'Contact' },
  { href: '/admin/limits', label: 'Limits' },
  { href: '/admin/funnel', label: 'Funnel' },
];

export function AdminNav() {
  const path = usePathname();
  return (
    <div className="mb-6 flex items-center gap-1 border-b border-black/[0.06]">
      {LINKS.map((l) => {
        const active = l.href === '/admin' ? path === '/admin' : path.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            className={`-mb-px border-b-2 px-4 py-2.5 text-[13px] font-semibold transition ${
              active
                ? 'border-[var(--color-cat-image)] text-[var(--color-fg)]'
                : 'border-transparent text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]'
            }`}
          >
            {l.label}
          </Link>
        );
      })}
    </div>
  );
}
