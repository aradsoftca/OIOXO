import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'seo-twitter-card',
  name: 'Twitter Card Preview',
  blurb: 'See how your link will look in tweets — summary or large-image cards.',
  category: 'seo', tile: 'L', icon: 'twitter', compute: 'instant',
  keywords: ['twitter card', 'x preview', 'summary card', 'twitter:image'], offline: true,
};
export default manifest;
