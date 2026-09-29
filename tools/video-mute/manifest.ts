import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'video-mute',
  name: 'Mute Video',
  blurb: 'Strip the audio track — keep the video, lose the sound.',
  category: 'video', tile: 'M', icon: 'volume-x', compute: 'local',
  accepts: ['video/*'],
  produces: ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-matroska'],
  keywords: ['video', 'mute', 'remove audio', 'silence', 'strip sound'], offline: true,
};
export default manifest;
