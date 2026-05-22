import type { ToolManifest } from '@/lib/registry/types';

export const manifest: ToolManifest = {
  id: 'video-reframe',
  name: 'Vertical Video Reframe',
  blurb: 'Crop any video to 9:16, 4:5 or 1:1 for Reels, TikTok and Shorts — pick the focus.',
  category: 'video',
  tile: 'L',
  icon: 'crop',
  compute: 'local',
  accepts: ['video/mp4', 'video/webm', 'video/quicktime'],
  produces: ['video/mp4'],
  keywords: ['vertical video', 'reframe', 'crop video', '9:16', 'reels', 'tiktok', 'shorts', 'landscape to portrait'],
  pinDefault: true,
  offline: true,
};

export default manifest;
