import type { MetadataRoute } from 'next';

const SITE = 'https://xonvert.com';
const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/', '/auth/', '/dashboard/'],
      },
    ],
    sitemap: `${SITE}${BASE}/sitemap.xml`,
  };
}
