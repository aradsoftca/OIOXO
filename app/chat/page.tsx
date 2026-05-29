import * as React from 'react';
import type { Metadata } from 'next';
import ChatStudio from './ChatStudio';
import { BRAND } from '@/lib/brand';

export const metadata: Metadata = {
  title: 'Private Chat — secure, no sign-up, peer-to-peer',
  description: 'Start a private, end-to-end encrypted chat with one link. Messages go straight between devices over a peer-to-peer connection — no account, nothing stored on a server.',
  openGraph: {
    title: `${BRAND} Private Chat — secure peer-to-peer messaging`,
    description: 'One link, encrypted device-to-device chat. No account, no server.',
  },
};

export default function ChatPage() {
  return (
    <React.Suspense fallback={<div className="h-96 animate-pulse bg-[var(--color-surface-1)]" />}>
      <ChatStudio />
    </React.Suspense>
  );
}
