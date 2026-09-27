import type { MetadataRoute } from 'next';
import { BRAND_DOMAIN } from '@/lib/brand';

const SITE = `https://${BRAND_DOMAIN}`;
const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        // /_next/ carries every JS/CSS/font/image the page needs. Blocking it
        // made Google render unstyled pages whose tools never load. The explicit
        // allow also beats '/*?' (longest match wins) for /_next/image?url=….
        allow: ['/', '/_next/'],
        disallow: [
          '/api/',
          '/auth/',
          '/dashboard/',
          '/admin/',
          '/account/',
          '/limits/',
          '/*?',
        ],
      },
      { userAgent: 'GPTBot', disallow: ['/'] },
      { userAgent: 'CCBot', disallow: ['/'] },
      { userAgent: 'anthropic-ai', disallow: ['/'] },
      { userAgent: 'Google-Extended', disallow: ['/'] },
      { userAgent: 'PerplexityBot', disallow: ['/'] },
      { userAgent: 'ClaudeBot', disallow: ['/'] },
    ],
    sitemap: [`${SITE}${BASE}/sitemap.xml`],
    host: SITE,
  };
}
