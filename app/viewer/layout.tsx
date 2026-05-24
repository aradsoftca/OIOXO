import type { Metadata } from 'next';
import { BRAND } from '@/lib/brand';

export const metadata: Metadata = {
  title: 'Universal File Viewer — open any file in your browser',
  description:
    'View images, PDFs, video, audio, text, code, JSON, CSV and SVG instantly in your browser. Nothing is uploaded — files stay on your device.',
  openGraph: {
    title: `Universal File Viewer · ${BRAND}`,
    description: 'Open any file in your browser — images, PDF, video, audio, text, code, JSON, CSV. Private, no upload.',
  },
};

export default function ViewerLayout({ children }: { children: React.ReactNode }) {
  return children;
}
