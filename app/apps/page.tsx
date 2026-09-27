import * as React from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { TileIcon } from '@/components/tiles/TileIcon';
import { SectionTitle } from '@/components/layout/SectionTitle';
import { BRAND, BRAND_DOMAIN, IS_OIOXO } from '@/lib/brand';
import { appsOnly } from '@/lib/apps';
import { buildMeta } from '@/lib/seo/meta';
import { faqPageJsonLd, structuredDataToScript } from '@/lib/seo/jsonld';

export const metadata: Metadata = buildMeta({
  path: '/apps',
  title: IS_OIOXO
    ? `${BRAND} Apps — AI + peer-to-peer chat, calls, file send`
    : `${BRAND} Apps — peer-to-peer file send, chat, call, screen share`,
  description: IS_OIOXO
    ? `${BRAND} apps pair an on-device AI assistant with peer-to-peer chat, calls, file send, screen share, and clipboard sync. Nothing stored on a server, no signup, no install.`
    : `${BRAND} apps: send files, sync your clipboard, chat, share your screen and video call — peer-to-peer or on-device, nothing stored on a server.`,
  keywords: IS_OIOXO
    ? [
        'on-device ai chat',
        'private ai assistant',
        'p2p chat with ai',
        'webrtc + ai',
        'ai-enabled file send',
        'browser ai apps',
        'no signup ai chat',
        'private peer-to-peer ai',
        'webgpu chat',
        'browser apps with private ai',
      ]
    : [
        'browser file transfer',
        'p2p file send',
        'webrtc chat',
        'browser screen share',
        'browser video call',
        'clipboard sync',
        'peer-to-peer apps',
        'private apps',
        'no signup chat',
        'no install file send',
      ],
});

const APPS_FAQS_XONVERT = [
  { q: 'Are these apps free?', a: 'Yes — every app is free. No account or signup required. Pro adds extras like higher file transfer limits and watermark removal on screen recordings.' },
  { q: 'How does peer-to-peer work?', a: 'Two devices connect directly over WebRTC. Once the connection is established, your data flows device-to-device without passing through any server. Only the initial handshake uses our signaling server, which sees nothing of your content.' },
  { q: 'Do messages or files get logged?', a: 'No. Send, Chat, Call, and Clipboard use end-to-end encrypted P2P channels. We cannot see what you send, store, or share, because the data never reaches our servers.' },
  { q: 'Can I use these apps on mobile?', a: 'Yes. The apps work in any modern mobile browser — Safari, Chrome, Firefox — without installing anything.' },
  { q: 'Do both devices have to be online at the same time?', a: 'For real-time apps like Chat and Call, yes. For Send, the file transfer needs both devices online during the transfer, but they do not have to be on the same network.' },
];

const APPS_FAQS_OIOXO = [
  { q: 'What does the AI in oioxo Apps actually do?', a: 'The oioxo AI is a conductor that runs on your device. In Apps it summarizes long chats, drafts replies in your voice, suggests files to send next, transcribes calls in real time, and answers questions about content shared in chat — all without sending anything to a cloud AI provider.' },
  { q: 'Does the AI process my chat or calls in the cloud?', a: 'No. The conductor and the specialist models for transcription and summarization run on your device via WebGPU (with a WASM fallback). The other side of the chat / call still uses end-to-end encrypted WebRTC. There is no cloud AI in the loop on either end.' },
  { q: 'How are these different from regular AI chat products?', a: 'Regular AI chat sends your messages to a remote model. oioxo flips that: the AI runs on your hardware and helps you with your real apps (chat, call, send, clipboard). No prompt logging, no training-data sampling, no rate-limited cloud quota — your hardware is the limit.' },
  { q: 'Is everything free?', a: 'Yes. The peer-to-peer apps and the on-device AI features are free. Pro lifts file-size and quota limits and unlocks higher-quality specialist models for the heaviest jobs.' },
  { q: 'What hardware do I need for the AI features?', a: 'WebGPU is preferred for fast local inference — any 2022+ desktop GPU, Apple Silicon, or many recent Android devices. Older hardware falls back to a slower WASM path. The non-AI apps (Send, Chat, Call, Clipboard) work on any modern browser.' },
];

const APPS_FAQS = IS_OIOXO ? APPS_FAQS_OIOXO : APPS_FAQS_XONVERT;

export default function AppsPage() {
  const apps = appsOnly(IS_OIOXO);
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
          <Link prefetch={false} key={a.href} href={a.href}
            className="group flex flex-col gap-3 bg-[var(--color-surface-1)] p-5 transition hover:bg-[var(--color-surface-2)]">
            <div className="flex items-center justify-between">
              <span className="grid h-11 w-11 place-items-center text-white" style={{ background: `var(${a.colorVar})` }}>
                <TileIcon name={a.icon} size={22} strokeWidth={1.75} />
              </span>
              <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--color-fg-subtle)]">{a.tag}</span>
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

      <section className="space-y-3 pt-6">
        <h2 className="text-[20px] font-bold tracking-tight text-[var(--color-fg)]">Apps FAQ</h2>
        <div className="space-y-2">
          {APPS_FAQS.map((f, i) => (
            <details key={i} className="group border border-black/[0.06] bg-[var(--color-surface-1)] p-4">
              <summary className="flex cursor-pointer items-start justify-between gap-3 text-[14px] font-semibold">
                <span>{f.q}</span>
                <span className="shrink-0 text-[var(--color-fg-muted)] transition-transform group-open:rotate-45">+</span>
              </summary>
              <div className="mt-2 text-[13px] text-[var(--color-fg-muted)]">{f.a}</div>
            </details>
          ))}
        </div>
      </section>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: structuredDataToScript(faqPageJsonLd(APPS_FAQS)) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: structuredDataToScript({
            '@context': 'https://schema.org',
            '@type': 'ItemList',
            name: `${BRAND} Apps`,
            numberOfItems: apps.length,
            itemListElement: apps.map((a, i) => ({
              '@type': 'ListItem',
              position: i + 1,
              name: a.name,
              url: `https://${BRAND_DOMAIN}${a.href}`,
              description: a.blurb,
            })),
          }),
        }}
      />
    </div>
  );
}
