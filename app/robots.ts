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
      // AI search/answer crawlers (GPTBot, ClaudeBot, PerplexityBot, Google-Extended…) are
      // allowed by the '*' rule on purpose (2026-10-05): ChatGPT, Perplexity and Gemini answers
      // that cite and link the tools are a traffic source Google search alone isn't giving us.
    ],
    sitemap: [`${SITE}${BASE}/sitemap.xml`],
    host: SITE,
  };
}
