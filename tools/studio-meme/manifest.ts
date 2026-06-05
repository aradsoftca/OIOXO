import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'studio-meme',
  name: 'Meme Studio',
  blurb: 'Create classic memes with impact font, modern twitter-style memes, and demotivational posters.',
  category: 'social', tile: 'L', icon: 'smile', compute: 'instant',
  keywords: ['meme', 'meme generator', 'meme maker', 'impact font'], offline: true,
};
export default manifest;
