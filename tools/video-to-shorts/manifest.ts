import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'video-to-shorts', name: 'Shorts / Reels Maker',
  blurb: 'Reframe any video to a vertical 9:16, square 1:1, or 4:5 crop for Shorts, Reels, and TikTok — fills the frame, no black bars.',
  category: 'video', tile: 'M', icon: 'smartphone', compute: 'local',
  accepts: ['video/*'], produces: ['video/mp4'],
  keywords: ['shorts maker', 'reels', 'tiktok', 'vertical video', '9:16', 'reframe', 'crop video', 'square video'], offline: true, pinDefault: true,
};
export default manifest;
