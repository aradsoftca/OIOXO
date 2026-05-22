import * as React from 'react';
import type { Metadata } from 'next';
import ClipboardApp from './ClipboardApp';

export const metadata: Metadata = {
  title: 'Universal Clipboard — copy on one device, paste on another',
  description: 'Sync text and links between your phone and computer instantly over an encrypted peer-to-peer connection. No account, nothing stored on a server.',
  openGraph: {
    title: 'Xonvert Universal Clipboard — copy here, paste there',
    description: 'Beam clipboard text between devices, peer-to-peer. Nothing touches a server.',
  },
};

export default function ClipboardPage() {
  return (
    <React.Suspense fallback={<div className="h-96 animate-pulse bg-[var(--color-surface-1)]" />}>
      <ClipboardApp />
    </React.Suspense>
  );
}
