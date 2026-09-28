import * as React from 'react';
import type { Metadata } from 'next';
import NoteApp from './NoteApp';
import { BRAND } from '@/lib/brand';
import { AppSteps, AppAbout } from '@/components/apps/AppGuide';

export const metadata: Metadata = {
  title: 'Encrypted Note — share a secret with a self-destructing link',
  description: 'Write a note, encrypt it in your browser, and share a one-time link. The key never leaves your device — our server only ever stores unreadable ciphertext.',
  openGraph: {
    title: `${BRAND} Encrypted Note — zero-knowledge secret sharing`,
    description: 'Client-side encrypted, self-destructing notes. The server can never read them.',
  },
};

export default function NotePage() {
  return (
    <>
      <AppSteps app="note" />
      <React.Suspense fallback={<div className="h-96 animate-pulse bg-[var(--color-surface-1)]" />}>
        <NoteApp />
      </React.Suspense>
      <AppAbout app="note" />
    </>
  );
}
