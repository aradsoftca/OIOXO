import type { Metadata } from 'next';
import { BRAND, BRAND_DOMAIN } from '@/lib/brand';

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
const SITE = `https://${BRAND_DOMAIN}`;

export function absUrl(path: string): string {
  if (path.startsWith('http')) return path;
  return `${SITE}${BASE}${path.startsWith('/') ? path : '/' + path}`;
}

export interface PageMetaInput {
  path: string;
  title: string;
  description: string;
  keywords?: string[];
  ogImage?: string;
  ogType?: 'website' | 'article';
  publishedTime?: string;
  modifiedTime?: string;
  noindex?: boolean;
  altLang?: { hreflang: string; href: string }[];
}

export function buildMeta(input: PageMetaInput): Metadata {
  const url = absUrl(input.path);
  const title = ensureLength(input.title, 60);
  const description = ensureLength(input.description, 160);
  const ogImage = input.ogImage ?? absUrl('/og-default.png');

  const meta: Metadata = {
    title,
    description,
    keywords: input.keywords,
    metadataBase: new URL(SITE),
    alternates: {
      canonical: url,
      languages: input.altLang ? Object.fromEntries(input.altLang.map(a => [a.hreflang, a.href])) : undefined,
    },
    openGraph: {
      type: input.ogType ?? 'website',
      url,
      siteName: BRAND,
      title,
      description,
      images: [{ url: ogImage, width: 1200, height: 630, alt: title }],
      publishedTime: input.publishedTime,
      modifiedTime: input.modifiedTime,
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [ogImage],
    },
    robots: input.noindex
      ? { index: false, follow: false, googleBot: { index: false, follow: false } }
      : {
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
  };

  return meta;
}

function ensureLength(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const target = maxChars - 3;
  const truncated = text.slice(0, target);
  const lastSpace = truncated.lastIndexOf(' ');
  const tight = lastSpace > target - 12 ? truncated.slice(0, lastSpace) : truncated;
  return `${tight}…`;
}
