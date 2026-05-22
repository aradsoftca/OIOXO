import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'seo-meta-tag',
  name: 'Meta Tag Analyzer',
  blurb: 'Paste HTML — see every meta tag, flag missing essentials, suggest fixes.',
  category: 'seo', tile: 'M', icon: 'tag', compute: 'instant',
  keywords: ['meta tags', 'seo analyzer', 'description', 'og tags'], offline: true,
};
export default manifest;
