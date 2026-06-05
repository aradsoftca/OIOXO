import type { ToolManifest } from '@/lib/registry/types';

export const manifest: ToolManifest = {
  id: 'studio-gif',
  name: 'GIF Studio',
  blurb: 'Create animated GIFs online instantly. Convert multiple images to GIF, adjust frame speeds, loop counts, and add captions.',
  category: 'social',
  tile: 'L',
  icon: 'video',
  compute: 'instant',
  keywords: ['gif maker', 'gif generator', 'make a gif', 'gif designer', 'images to gif'],
  offline: true,
};

export default manifest;
