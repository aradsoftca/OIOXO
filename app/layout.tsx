import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono, Space_Grotesk } from 'next/font/google';
import { AppShell } from '@/components/layout/AppShell';
import { Providers } from '@/components/Providers';
import './globals.css';

// Modern type system, self-hosted by next/font (no runtime request):
// Geist for UI/body, Space Grotesk for display headings, Geist Mono for code.
const geist = Geist({ subsets: ['latin'], variable: '--font-geist', display: 'swap' });
const geistMono = Geist_Mono({ subsets: ['latin'], variable: '--font-geist-mono', display: 'swap' });
const spaceGrotesk = Space_Grotesk({ subsets: ['latin'], variable: '--font-grotesk', display: 'swap' });

export const metadata: Metadata = {
  title: { default: 'Xonvert — Every file. Every tool. One tap.', template: '%s · Xonvert' },
  description:
    'Convert, compress, edit, and analyze any file. 400+ tools. Files stay yours.',
  metadataBase: new URL('https://xonvert.com'),
  icons: { icon: '/icon.png', apple: '/apple-icon.png' },
  openGraph: {
    title: 'Xonvert — Every file. Every tool. One tap.',
    description: 'Convert, compress, edit, and analyze any file. Files stay yours.',
    url: 'https://xonvert.com',
    type: 'website',
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#f6f1e7',
  colorScheme: 'light',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geist.variable} ${geistMono.variable} ${spaceGrotesk.variable}`}>
      <body className="bg-[var(--color-canvas)] text-[var(--color-fg)] antialiased">
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
