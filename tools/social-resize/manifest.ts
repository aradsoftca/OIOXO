import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'social-resize',
  name: 'Social Media Resizer',
  blurb: 'One image → perfect sizes for Instagram, X, LinkedIn, YouTube, more.',
  category: 'social', tile: 'L', icon: 'share-2', compute: 'local',
  accepts: ['image/jpeg', 'image/png', 'image/webp', 'image/avif'],
  produces: ['image/jpeg', 'image/png', 'image/webp'],
  keywords: ['social media resize', 'instagram', 'twitter', 'linkedin', 'youtube banner'], offline: true,
};
export default manifest;
