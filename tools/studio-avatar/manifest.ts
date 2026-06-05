import type { ToolManifest } from '@/lib/registry/types';

export const manifest: ToolManifest = {
  id: 'studio-avatar',
  name: 'Avatar Studio',
  blurb: 'Design professional profile pictures and circular avatars. Isolate face, add border rings, and customize gradient backdrops.',
  category: 'social',
  tile: 'L',
  icon: 'avatar',
  compute: 'instant',
  keywords: ['profile picture maker', 'avatar maker', 'pfp generator', 'linkedin avatar', 'circular crop'],
  offline: false,
};

export default manifest;
