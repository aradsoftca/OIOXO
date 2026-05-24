import type { Metadata, Viewport } from 'next';
import { Geist, JetBrains_Mono } from 'next/font/google';
import { AppShell } from '@/components/layout/AppShell';
import { Providers } from '@/components/Providers';
import { BRAND, BRAND_TITLE, BRAND_DESC, BRAND_DOMAIN, IS_OIOXO } from '@/lib/brand';
import './globals.css';

// Modern type system, self-hosted by next/font (no runtime request):
// Geist for UI/body; JetBrains Mono for titles, code and the terminal chat —
// the "computer world" tech look.
const geist = Geist({ subsets: ['latin'], variable: '--font-geist', display: 'swap' });
const jetbrains = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono-tech', display: 'swap' });

export const metadata: Metadata = {
  title: { default: BRAND_TITLE, template: `%s · ${BRAND}` },
  description: BRAND_DESC,
  metadataBase: new URL(`https://${BRAND_DOMAIN}`),
  icons: { icon: '/icon.png', apple: '/apple-icon.png' },
  openGraph: {
    title: BRAND_TITLE,
    description: BRAND_DESC,
    url: `https://${BRAND_DOMAIN}`,
    type: 'website',
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: IS_OIOXO ? '#ffffff' : '#f6f1e7',
  colorScheme: 'light',
  // When the on-screen keyboard opens, resize the layout (not just overlay) so
  // the fullscreen AI chat's input + Send button stay visible above it.
  interactiveWidget: 'resizes-content',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geist.variable} ${jetbrains.variable}${IS_OIOXO ? ' brand-oioxo' : ''}`}>
      <body className="bg-[var(--color-canvas)] text-[var(--color-fg)] antialiased">
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
