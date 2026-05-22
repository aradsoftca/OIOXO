import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'seo-sitemap',
  name: 'Sitemap Generator',
  blurb: 'Paste a list of URLs — get a valid XML sitemap with last-modified and priorities.',
  category: 'seo', tile: 'M', icon: 'sitemap', compute: 'instant',
  keywords: ['sitemap', 'xml sitemap', 'urls'], offline: true,
};
export default manifest;
