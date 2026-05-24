import * as React from 'react';
import type { Metadata } from 'next';
import SummarizeApp from './SummarizeApp';
import { BRAND } from '@/lib/brand';

export const metadata: Metadata = {
  title: 'Private Summarizer & Translator — runs in your browser',
  description: 'Summarize or translate text and PDFs with an AI model that runs entirely on your own device. Nothing is uploaded — fully private, no account.',
  openGraph: {
    title: `${BRAND} Private Summarizer & Translator`,
    description: 'On-device AI summary & translation. Your text never leaves the browser.',
  },
};

export default function SummarizePage() {
  return <SummarizeApp />;
}
