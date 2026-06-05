import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'studio-thumbnail',
  name: 'Thumbnail Studio',
  blurb: 'Create click-worthy YouTube thumbnails — bold text, shapes, emoji overlays, 1280×720 export.',
  category: 'social', tile: 'L', icon: 'image-play', compute: 'instant',
  keywords: ['youtube thumbnail', 'thumbnail maker', 'thumbnail creator', 'video thumbnail'], offline: true,
};
export default manifest;
