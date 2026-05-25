import * as React from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { TileIcon } from '@/components/tiles/TileIcon';
import { SectionTitle } from '@/components/layout/SectionTitle';
import { BRAND, IS_OIOXO } from '@/lib/brand';
import { visibleApps } from '@/lib/apps';

export const metadata: Metadata = {
  title: 'Apps — private, peer-to-peer & on-device tools',
  description: IS_OIOXO
    ? `${BRAND} apps: send files, sync your clipboard, chat, share your screen, video call and run a private AI — all peer-to-peer or on-device, nothing stored on a server.`
    : `${BRAND} apps: send files, sync your clipboard, chat, share your screen and video call — all peer-to-peer or on-device, nothing stored on a server.`,
};

export default function AppsPage() {
  const apps = visibleApps(IS_OIOXO);
  return (
    <div className="space-y-8">
      <header className="space-y-3">
        <SectionTitle label="Apps" colorVar="--color-cat-convert" />
        <h1 className="text-[40px] font-bold tracking-tight text-[var(--color-fg)]">Apps</h1>
        <p className="max-w-2xl text-[14px] text-[var(--color-fg-muted)]">
          Full-screen apps that run <strong className="text-[var(--color-fg)]">peer-to-peer</strong> or{' '}
          <strong className="text-[var(--color-fg)]">on your own device</strong> — your files, messages and data never touch a server.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-[2px] sm:grid-cols-2 lg:grid-cols-3">
        {apps.map((a) => (
          <Link key={a.href} href={a.href}
            className="group flex flex-col gap-3 bg-[var(--color-surface-1)] p-5 transition hover:bg-[var(--color-surface-2)]">
            <div className="flex items-center justify-between">
              <span className="grid h-11 w-11 place-items-center text-white" style={{ background: `var(${a.colorVar})` }}>
                <TileIcon name={a.icon} size={22} strokeWidth={1.75} />
              </span>
              <span className="text-[9px] font-bold uppercase tracking-[0.18em] text-[var(--color-fg-subtle)]">{a.tag}</span>
            </div>
            <div>
              <div className="flex items-center gap-1.5 text-[16px] font-bold tracking-tight text-[var(--color-fg)]">
                {a.name}
                <span className="text-[var(--color-fg-subtle)] transition group-hover:translate-x-0.5">→</span>
              </div>
              <p className="mt-1 text-[13px] leading-relaxed text-[var(--color-fg-muted)]">{a.blurb}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
