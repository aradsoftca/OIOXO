import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'video-auto-subtitle',
  name: 'Caption Studio',
  blurb: 'Auto-caption any video with modern styles — word-by-word pops, karaoke highlight, fast bursts or classic lines. Original language or translated, fully styled, burned in on your device.',
  category: 'video', tile: 'L', icon: 'captions', compute: 'webgpu',
  accepts: ['video/*'],
  produces: ['video/mp4', 'text/vtt', 'application/x-subrip'],
  keywords: ['caption studio', 'auto captions', 'subtitles', 'capcut captions', 'reels captions', 'tiktok subtitles', 'karaoke captions', 'word by word', 'burn subtitles', 'srt', 'vtt', 'speech to text', 'translate captions'],
  offline: true,
  pinDefault: true,
};
export default manifest;
