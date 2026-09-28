import * as React from 'react';
import type { Metadata } from 'next';
import BoardApp from './BoardApp';
import { BRAND } from '@/lib/brand';
import { AppSteps, AppAbout } from '@/components/apps/AppGuide';

export const metadata: Metadata = {
  title: 'Collaborative Whiteboard — draw together, no sign-up',
  description: 'A real-time shared whiteboard you open with one link. Everyone draws together over an encrypted peer-to-peer connection — no account, nothing stored on a server.',
  openGraph: {
    title: `${BRAND} Whiteboard — real-time, peer-to-peer, no sign-up`,
    description: 'Draw together live from one link. Encrypted P2P, no account, nothing stored on a server.',
  },
};

export default function BoardPage() {
  return (
    <>
      <AppSteps app="board" />
      <React.Suspense fallback={<div className="h-96 animate-pulse bg-[var(--color-surface-1)]" />}>
        <BoardApp />
      </React.Suspense>
      <AppAbout app="board" />
    </>
  );
}
