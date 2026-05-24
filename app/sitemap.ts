import type { MetadataRoute } from 'next';
import { TOOLS, CATEGORIES } from '@/lib/registry';
import { CONVERT_PAIRS } from '@/lib/convert/pairs';
import { POSTS } from '@/lib/blog/posts';
import { BRAND_DOMAIN } from '@/lib/brand';

const SITE = `https://${BRAND_DOMAIN}`;
const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

function url(path: string): string {
  return `${SITE}${BASE}${path}`;
}

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  return [
    { url: url('/'), lastModified: now, changeFrequency: 'weekly', priority: 1 },
    { url: url('/tools'), lastModified: now, changeFrequency: 'weekly', priority: 0.8 },
    { url: url('/convert'), lastModified: now, changeFrequency: 'weekly', priority: 0.8 },
    { url: url('/viewer'), lastModified: now, changeFrequency: 'monthly', priority: 0.7 },
    { url: url('/formats'), lastModified: now, changeFrequency: 'monthly', priority: 0.6 },
    { url: url('/pricing'), lastModified: now, changeFrequency: 'monthly', priority: 0.6 },
    { url: url('/blog'), lastModified: now, changeFrequency: 'weekly', priority: 0.6 },
    { url: url('/help'), lastModified: now, changeFrequency: 'monthly', priority: 0.5 },
    ...['/privacy', '/terms', '/cookies', '/refund'].map((p) => ({
      url: url(p), lastModified: now, changeFrequency: 'yearly' as const, priority: 0.3,
    })),

    // Blog posts
    ...POSTS.map((p) => ({
      url: url(`/blog/${p.slug}`),
      lastModified: new Date(p.date),
      changeFrequency: 'monthly' as const,
      priority: 0.5,
    })),

    // Convert pairs (high-value SEO landing pages)
    ...CONVERT_PAIRS.map((p) => ({
      url: url(`/convert/${p.from}-to-${p.to}`),
      lastModified: now,
      changeFrequency: 'monthly' as const,
      priority: 0.6,
    })),

    // Tool pages — only the ones marked as having real content get prioritized.
    // Stubs default to lower priority. Per SEO strategy doc, in production
    // we will gate `index: true` behind a `seo.ready` manifest flag.
    ...TOOLS.map((t) => ({
      url: url(`/tools/${t.id}`),
      lastModified: now,
      changeFrequency: 'monthly' as const,
      priority: t.pinDefault ? 0.7 : 0.5,
    })),

    // Category landing pages
    ...Object.values(CATEGORIES).map((c) => ({
      url: url(`/tools?cat=${c.id}`),
      lastModified: now,
      changeFrequency: 'weekly' as const,
      priority: 0.6,
    })),
  ];
}
