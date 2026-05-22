import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'subtitle-fps-converter',
  name: 'FPS Converter',
  blurb: 'Re-time subtitles when the video frame rate changes — 23.976 ↔ 25, etc.',
  category: 'subtitle', tile: 'M', icon: 'film', compute: 'instant',
  keywords: ['fps', 'frame rate', 'subtitle timing', '23.976', '25', 'pal', 'ntsc'], offline: true,
};
export default manifest;
