import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'seo-headings',
  name: 'Heading Structure',
  blurb: 'Paste HTML — see the H1–H6 outline and flag bad hierarchy.',
  category: 'seo', tile: 'M', icon: 'heading', compute: 'instant',
  keywords: ['heading structure', 'h1 h2', 'outline', 'accessibility'], offline: true,
};
export default manifest;
