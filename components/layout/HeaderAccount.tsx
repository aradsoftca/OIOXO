'use client';

import * as React from 'react';
import Link from 'next/link';
import { useSession, signOut } from 'next-auth/react';
import { TileIcon } from '@/components/tiles/TileIcon';

/**
 * Header account area. Logged out → Sign in + gradient Sign up.
 * Logged in → avatar button with a dropdown (account, admin if ADMIN, sign out)
 * plus a PRO badge. Brand gradient = the logo's indigo→purple.
 */
export function HeaderAccount() {
  const { data: session, status } = useSession();
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  if (status === 'loading') {
    return <div className="h-8 w-16 animate-pulse rounded-lg bg-black/[0.05]" />;
  }

  const user = session?.user as { name?: string; email?: string; plan?: string; role?: string } | undefined;

  if (!user) {
    return (
      <div className="flex items-center gap-2">
        <Link
          href="/auth/sign-in"
          className="hidden rounded-lg px-3 py-1.5 text-[13px] font-medium text-[var(--color-fg-muted)] transition hover:bg-black/[0.04] hover:text-[var(--color-fg)] sm:block"
        >
          Sign in
        </Link>
        <Link
          href="/auth/sign-up"
          className="rounded-lg px-4 py-1.5 text-[13px] font-semibold text-white shadow-[0_1px_3px_rgba(79,70,229,0.35)] transition hover:brightness-110 hover:shadow-[0_4px_14px_rgba(79,70,229,0.4)]"
          style={{ background: 'var(--brand-gradient)' }}
        >
          Sign up
        </Link>
      </div>
    );
  }

  const initial = (user.name || user.email || '?').charAt(0).toUpperCase();
  const isPro = user.plan === 'PRO' || user.plan === 'BUSINESS';
  const isAdmin = user.role === 'ADMIN';

  return (
    <div className="relative flex items-center gap-2" ref={ref}>
      {isPro && (
        <span
          className="hidden items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-white sm:inline-flex"
          style={{ background: 'var(--brand-gradient)' }}
        >
          <TileIcon name="crown" size={11} /> Pro
        </span>
      )}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-xl p-1 transition hover:bg-black/[0.04]"
        aria-label="Account menu"
      >
        <span
          className="grid h-8 w-8 place-items-center rounded-[10px] text-[13px] font-bold text-white"
          style={{ background: 'var(--brand-gradient)' }}
        >
          {initial}
        </span>
      </button>

      {open && (
        <div className="absolute right-0 top-[calc(100%+8px)] z-50 w-56 overflow-hidden rounded-2xl border border-black/[0.06] bg-white p-1.5 shadow-[0_10px_40px_rgba(0,0,0,0.12)]">
          <div className="px-3 py-2">
            <div className="truncate text-[13px] font-semibold text-[var(--color-fg)]">{user.name || 'Account'}</div>
            <div className="truncate text-[11px] text-[var(--color-fg-muted)]">{user.email}</div>
          </div>
          <div className="my-1 h-px bg-black/[0.06]" />
          <MenuLink href="/account" icon="user" label="My account" onClick={() => setOpen(false)} />
          {!isPro && <MenuLink href="/pricing" icon="crown" label="Upgrade to Pro" onClick={() => setOpen(false)} accent />}
          {isAdmin && <MenuLink href="/admin" icon="shield" label="Admin" onClick={() => setOpen(false)} />}
          <MenuLink href="/support" icon="life-buoy" label="Support" onClick={() => setOpen(false)} />
          <div className="my-1 h-px bg-black/[0.06]" />
          <button
            type="button"
            onClick={() => signOut({ callbackUrl: '/' })}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] text-[var(--color-cat-pdf)] transition hover:bg-[var(--color-cat-pdf)]/[0.06]"
          >
            <TileIcon name="log-out" size={15} /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}

function MenuLink({
  href, icon, label, onClick, accent,
}: { href: string; icon: string; label: string; onClick: () => void; accent?: boolean }) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] transition hover:bg-black/[0.04] ${accent ? 'font-semibold text-[#7c3aed]' : 'text-[var(--color-fg)]'}`}
    >
      <TileIcon name={icon} size={15} className={accent ? '' : 'text-[var(--color-fg-muted)]'} /> {label}
    </Link>
  );
}
