import * as React from 'react';
import type { Metadata } from 'next';
import WatchStudio from './WatchStudio';
import { BRAND } from '@/lib/brand';
import { AppSteps, AppAbout } from '@/components/apps/AppGuide';

export const metadata: Metadata = {
  title: 'Live Screen Share — show your screen, no install',
  description: 'Share your screen live to anyone with a link, peer-to-peer and encrypted. No download, no account, nothing routed through a server.',
  openGraph: {
    title: `${BRAND} Live Screen Share`,
    description: 'Beam your screen to a viewer over an encrypted peer-to-peer connection — no install.',
  },
};

export default function WatchPage() {
  return (
    <>
      <AppSteps app="watch" />
      <React.Suspense fallback={<div className="h-96 animate-pulse bg-[var(--color-surface-1)]" />}>
        <WatchStudio />
      </React.Suspense>
      <AppAbout app="watch" />
    </>
  );
}
