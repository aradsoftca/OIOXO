import type { MetadataRoute } from 'next';
import { TOOLS, CATEGORIES } from '@/lib/registry';
import { CONVERT_PAIRS } from '@/lib/convert/pairs';
import { POSTS } from '@/lib/blog/posts';
import { BRAND_DOMAIN, IS_OIOXO } from '@/lib/brand';
import { isStudioDisabled } from '@/lib/studios/disabled';
import { CAD3D_FORMATS } from '@/lib/convert/cad3d';
import { FORMAT_PROFILES } from '@/lib/convert/format-profiles';

const SITE = `https://${BRAND_DOMAIN}`;
const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

function url(path: string): string {
  return `${SITE}${BASE}${path}`;
}

const SUITE_HUBS_XONVERT: string[] = [
  '/',
  '/tools',
  '/cad-3d',
  '/convert',
  '/apps',
  '/blog',
  '/help',
  '/pricing',
  '/formats',
];

const SUITE_HUBS_OIOXO: string[] = [
  '/',
  '/ai',
  '/studios',
  '/tools',
  '/apps',
  '/convert',
  '/blog',
  '/help',
  '/pricing',
];

const PRO_STUDIO_PAGES: string[] = [
  '/tools/image-studio',
  '/tools/video-studio',
  '/tools/audio-voice-studio',
  '/tools/audio-music-studio',
  '/tools/subtitle-studio',
  '/tools/pdf-studio',
  '/tools/office-studio',
  '/tools/office-docs',
  '/tools/office-slides',
];

const APP_PAGES: string[] = [
  '/chat',
  '/call',
  '/watch',
  '/send',
  '/clipboard',
  '/note',
  '/board',
  '/summarize',
  '/ai',
];

const POLICY_PAGES = ['/privacy', '/terms', '/cookies', '/refund'];

function isHighQualityPair(p: { popular?: boolean }): boolean {
  return !!p.popular;
}

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const entries: MetadataRoute.Sitemap = [];

  const hubs = IS_OIOXO ? SUITE_HUBS_OIOXO : SUITE_HUBS_XONVERT;
  for (const path of hubs) {
    entries.push({
      url: url(path),
      lastModified: now,
      changeFrequency: path === '/' ? 'daily' : 'weekly',
      priority: path === '/' ? 1.0 : (IS_OIOXO && (path === '/ai' || path === '/studios')) ? 0.95 : 0.8,
    });
  }

  for (const path of PRO_STUDIO_PAGES) {
    if (isStudioDisabled(path.slice('/tools/'.length))) continue;
    entries.push({
      url: url(path),
      lastModified: now,
      changeFrequency: 'weekly',
      priority: IS_OIOXO ? 0.85 : 0.9,
    });
  }

  for (const path of APP_PAGES) {
    if (hubs.includes(path)) continue;
    if (!IS_OIOXO && (path === '/ai' || path === '/summarize')) continue; // OIOXO-only, redirected on xonvert
    entries.push({
      url: url(path),
      lastModified: now,
      changeFrequency: 'weekly',
      priority: IS_OIOXO ? 0.8 : 0.7,
    });
  }

  // Format encyclopedia entries (hand-written profiles only).
  if (!IS_OIOXO) {
    for (const fmt of [...Object.keys(FORMAT_PROFILES), ...Object.keys(CAD3D_FORMATS)]) {
      entries.push({ url: url(`/formats/${fmt}`), lastModified: now, changeFrequency: 'monthly', priority: 0.6 });
    }
  }

  for (const post of POSTS) {
    entries.push({
      url: url(`/blog/${post.slug}`),
      lastModified: new Date(post.date),
      changeFrequency: 'monthly',
      priority: 0.6,
    });
  }

  for (const tool of TOOLS) {
    if (PRO_STUDIO_PAGES.some((p) => p.endsWith(`/${tool.id}`))) continue;
    const basePri = tool.pinDefault ? 0.7 : 0.5;
    entries.push({
      url: url(`/tools/${tool.id}`),
      lastModified: now,
      changeFrequency: 'monthly',
      priority: IS_OIOXO ? basePri - 0.05 : basePri,
    });
  }

  for (const cat of Object.values(CATEGORIES)) {
    entries.push({
      url: url(`/tools/c/${cat.id}`),
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.75,
    });
  }

  for (const pair of CONVERT_PAIRS) {
    if (!isHighQualityPair(pair)) continue;
    entries.push({
      url: url(`/convert/${pair.from}-to-${pair.to}`),
      lastModified: now,
      changeFrequency: 'monthly',
      priority: IS_OIOXO ? 0.55 : 0.65,
    });
  }

  for (const path of POLICY_PAGES) {
    entries.push({
      url: url(path),
      lastModified: now,
      changeFrequency: 'yearly',
      priority: 0.2,
    });
  }

  return entries;
}
