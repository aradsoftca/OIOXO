import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'video-extract-audio',
  name: 'Extract Audio',
  blurb: 'Pull just the audio from any video — keep the sound, lose the picture.',
  category: 'video', tile: 'M', icon: 'music-2', compute: 'local',
  accepts: ['video/*'],
  produces: ['audio/webm'],
  keywords: ['video', 'extract audio', 'rip audio', 'soundtrack', 'mp3 from video'], offline: true,
};
export default manifest;
