import * as React from 'react';
import type { Metadata } from 'next';
import CallStudio from './CallStudio';
import { BRAND } from '@/lib/brand';

export const metadata: Metadata = {
  title: 'Free Video Call — no sign up, no install',
  description: 'Start a private video call with one link. Peer-to-peer and encrypted, no account, no app, nothing routed through a server.',
  openGraph: {
    title: `${BRAND} Call — free private video call, no sign up`,
    description: 'One link, encrypted peer-to-peer video. No account or install.',
  },
};

export default function CallPage() {
  return (
    <React.Suspense fallback={<div className="h-96 animate-pulse bg-[var(--color-surface-1)]" />}>
      <CallStudio />
    </React.Suspense>
  );
}
