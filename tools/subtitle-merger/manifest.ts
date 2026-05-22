import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'subtitle-merger',
  name: 'Merge',
  blurb: 'Combine two subtitle files end-to-end with optional offset.',
  category: 'subtitle', tile: 'M', icon: 'merge', compute: 'instant',
  keywords: ['merge subtitles', 'combine srt', 'append'], offline: true,
};
export default manifest;
