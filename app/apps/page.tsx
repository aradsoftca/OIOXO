import * as React from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { TileIcon } from '@/components/tiles/TileIcon';
import { SectionTitle } from '@/components/layout/SectionTitle';

export const metadata: Metadata = {
  title: 'Apps — private, peer-to-peer & on-device tools',
  description: 'Xonvert apps: send files, sync your clipboard, chat, share your screen, video call and run a private AI — all peer-to-peer or on-device, nothing stored on a server.',
};

interface App {
  href: string;
  name: string;
  blurb: string;
  icon: string;
  colorVar: string;
  tag: string;
}

const APPS: App[] = [
  { href: '/send', name: 'Send', blurb: 'Beam files device to device over an encrypted P2P link. No upload, no size cap.', icon: 'send', colorVar: '--color-cat-convert', tag: 'Peer-to-peer' },
  { href: '/clipboard', name: 'Universal Clipboard', blurb: 'Copy on your phone, paste on your laptop. Text & links sync instantly across devices.', icon: 'clipboard-copy', colorVar: '--color-cat-convert', tag: 'Peer-to-peer' },
  { href: '/chat', name: 'Private Chat', blurb: 'Secure, encrypted messaging — text, emoji, photos & files — from one link. No sign-up.', icon: 'message-square', colorVar: '--color-cat-convert', tag: 'Peer-to-peer' },
  { href: '/board', name: 'Whiteboard', blurb: 'Draw together in real time from one link. Everyone’s strokes sync peer-to-peer.', icon: 'pencil', colorVar: '--color-cat-image', tag: 'Peer-to-peer' },
  { href: '/summarize', name: 'Summarizer & Translator', blurb: 'Summarize or translate text & PDFs with an AI model that runs on your device.', icon: 'file-text', colorVar: '--color-cat-dev', tag: 'On-device' },
  { href: '/note', name: 'Encrypted Note', blurb: 'Share a secret with a self-destructing link. Encrypted in your browser — we can’t read it.', icon: 'lock', colorVar: '--color-cat-dev', tag: 'Zero-knowledge' },
  { href: '/call', name: 'Video Call', blurb: 'Start a private video call with one link. No account, no install, encrypted P2P.', icon: 'video', colorVar: '--color-cat-video', tag: 'Peer-to-peer' },
  { href: '/watch', name: 'Live Screen Share', blurb: 'Show your screen live to anyone with a link. Direct, encrypted, no download.', icon: 'monitor-play', colorVar: '--color-cat-video', tag: 'Peer-to-peer' },
  { href: '/ai', name: 'Private AI', blurb: 'A real AI model that runs in your browser via WebGPU. Your chats never leave your device.', icon: 'bot', colorVar: '--color-cat-dev', tag: 'On-device' },
  { href: '/viewer', name: 'File Viewer', blurb: 'Open and preview almost any file type right in your browser — nothing uploaded.', icon: 'eye', colorVar: '--color-cat-image', tag: 'In-browser' },
];

export default function AppsPage() {
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
        {APPS.map((a) => (
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
