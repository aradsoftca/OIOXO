import type { ToolManifest } from '@/lib/registry/types';

export const manifest: ToolManifest = {
  id: 'video-add-audio',
  name: 'Add Audio to Video',
  blurb: 'Drop in a soundtrack — replace or set a video’s audio from an audio file.',
  category: 'video',
  tile: 'M',
  icon: 'music',
  compute: 'local',
  accepts: ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-matroska', 'video/x-msvideo'],
  produces: ['video/mp4'],
  keywords: ['add audio', 'add music', 'soundtrack', 'replace audio', 'video audio'],
  pinDefault: false,
  offline: true,
};

export default manifest;
