import * as React from 'react';
import type { Metadata } from 'next';
import SendApp from './SendApp';
import { BRAND } from '@/lib/brand';

export const metadata: Metadata = {
  title: 'Send — beam files device to device',
  description: 'Send files directly from one device to another over an encrypted peer-to-peer connection. Nothing is uploaded to or stored on a server.',
  openGraph: {
    title: `${BRAND} Send — beam files device to device`,
    description: 'Direct, encrypted, peer-to-peer file transfer. Files never touch a server.',
  },
};

export default function SendPage() {
  return (
    <React.Suspense fallback={<div className="h-96 animate-pulse bg-[var(--color-surface-1)]" />}>
      <SendApp />
    </React.Suspense>
  );
}
