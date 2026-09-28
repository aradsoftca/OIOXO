import type { Metadata, Viewport } from 'next';
import { Geist, JetBrains_Mono } from 'next/font/google';
import { AppShell } from '@/components/layout/AppShell';
import { Providers } from '@/components/Providers';
import { BRAND, BRAND_TITLE, BRAND_DESC, BRAND_DOMAIN, IS_OIOXO } from '@/lib/brand';
import { organizationJsonLd, webSiteJsonLd, structuredDataToScript } from '@/lib/seo/jsonld';
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
  applicationName: BRAND,
  generator: BRAND,
  authors: [{ name: BRAND, url: `https://${BRAND_DOMAIN}` }],
  publisher: BRAND,
  creator: BRAND,
  formatDetection: { email: false, address: false, telephone: false },
  // No site-wide canonical: every page that didn't set its own inherited the
  // homepage URL, telling Google /tools, /convert, /send… were copies of "/".
  // Pages that need one set it via buildMeta; the rest self-canonicalize.
  icons: IS_OIOXO
    ? {
        icon: [
          { url: '/oioxo-favicon.ico', sizes: 'any' },
          { url: '/oioxo-icon.svg', type: 'image/svg+xml' },
          { url: '/oioxo-icon.png', type: 'image/png', sizes: '512x512' },
        ],
        apple: '/oioxo-apple-icon.png',
        shortcut: '/oioxo-favicon.ico',
      }
    : { icon: '/icon.png', apple: '/apple-icon.png' },
  // public/manifest.webmanifest is OIOXO's search PWA (copied over by prebuild):
  // xonvert.com used to install as "oioxo — frontier search" opening a 404 /search.
  manifest: IS_OIOXO ? '/manifest.webmanifest' : '/xonvert.webmanifest',
  openGraph: {
    title: BRAND_TITLE,
    description: BRAND_DESC,
    // No site-wide og:url — same trap as the old canonical (every page that
    // didn't set one claimed to be the homepage). buildMeta sets it per page.
    siteName: BRAND,
    type: 'website',
    locale: 'en_US',
    images: [{ url: `https://${BRAND_DOMAIN}/og-default.png`, width: 1200, height: 630, alt: BRAND_TITLE }],
  },
  twitter: {
    card: 'summary_large_image',
    title: BRAND_TITLE,
    description: BRAND_DESC,
    images: [`https://${BRAND_DOMAIN}/og-default.png`],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
      'max-video-preview': -1,
    },
  },
  referrer: 'strict-origin-when-cross-origin',
  category: IS_OIOXO ? 'productivity' : 'utilities',
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
    <html lang="en" suppressHydrationWarning className={`${geist.variable} ${jetbrains.variable}${IS_OIOXO ? ' brand-oioxo' : ''}`}>
      <head>
        {/* Inside the Xonvert mobile app (lib/app-bridge.ts) the app draws its own
            navigation: flag it before first paint so the site chrome never flashes. */}
        <script dangerouslySetInnerHTML={{ __html: "if(navigator.userAgent.indexOf('XonvertApp/')>=0)document.documentElement.dataset.app='1'" }} />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: structuredDataToScript(organizationJsonLd()) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: structuredDataToScript(webSiteJsonLd()) }}
        />
      </head>
      <body className="bg-[var(--color-canvas)] text-[var(--color-fg)] antialiased">
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
