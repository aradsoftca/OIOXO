import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'seo-robots-txt',
  name: 'Robots.txt Generator',
  blurb: 'Build a clean robots.txt — pick agents, paths, and sitemaps.',
  category: 'seo', tile: 'M', icon: 'bot', compute: 'instant',
  keywords: ['robots.txt', 'crawler', 'disallow', 'allow'], offline: true,
};
export default manifest;
