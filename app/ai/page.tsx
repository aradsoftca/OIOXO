import * as React from 'react';
import type { Metadata } from 'next';
import AiApp from './AiApp';

export const metadata: Metadata = {
  title: 'Xonvert AI — your private all-in-one assistant',
  description: 'Chat with a private AI assistant that converts, edits, creates thumbnails & art, and finds the right tool. Fast, free, and private — no account needed.',
  openGraph: {
    title: 'Xonvert AI — private all-in-one assistant',
    description: 'A private AI assistant that does it all — convert, edit, create, and find the right tool. No account, no tracking.',
  },
};

export default function AiPage() {
  return <AiApp />;
}
