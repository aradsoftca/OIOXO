import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'subtitle-splitter',
  name: 'Split at Time',
  blurb: 'Cut a subtitle file in two at a chosen timestamp.',
  category: 'subtitle', tile: 'M', icon: 'split', compute: 'instant',
  keywords: ['split subtitle', 'cut srt', 'subtitle parts'], offline: true,
};
export default manifest;
