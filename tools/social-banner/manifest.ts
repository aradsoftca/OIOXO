import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'social-banner',
  name: 'Banner Cover',
  blurb: 'Generate channel/profile banners — Twitter, YouTube, LinkedIn, etc.',
  category: 'social', tile: 'L', icon: 'panel-top', compute: 'instant',
  produces: ['image/png', 'image/jpeg'],
  keywords: ['banner', 'cover photo', 'youtube banner', 'twitter header', 'linkedin cover'], offline: true,
};
export default manifest;
