import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'font-subset',
  name: 'Font Subset',
  blurb: 'Shrink a font to only the characters you actually use — often 90% smaller.',
  category: 'font', tile: 'M', icon: 'scissors', compute: 'local',
  accepts: ['font/ttf', 'font/otf', 'font/woff'],
  produces: ['font/ttf'],
  keywords: ['font', 'subset', 'shrink', 'reduce size', 'webfont', 'optimization'], offline: true,
};
export default manifest;
