import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'social-avatar',
  name: 'Profile Picture',
  blurb: 'Crop any image to a clean circular avatar with optional border.',
  category: 'social', tile: 'M', icon: 'user-round', compute: 'local',
  accepts: ['image/jpeg', 'image/png', 'image/webp', 'image/avif'],
  produces: ['image/png', 'image/webp'],
  keywords: ['avatar', 'profile picture', 'circle crop', 'pfp'], offline: true,
};
export default manifest;
