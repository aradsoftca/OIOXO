import type { ToolManifest } from '@/lib/registry/types';

export const manifest: ToolManifest = {
  id: 'video-volume',
  name: 'Adjust Video Volume',
  blurb: 'Turn a clip’s audio up or down without re-encoding the picture.',
  category: 'video',
  tile: 'M',
  icon: 'volume-2',
  compute: 'local',
  accepts: ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-matroska', 'video/x-msvideo'],
  produces: ['video/mp4'],
  keywords: ['video volume', 'louder', 'quieter', 'boost audio', 'lower volume'],
  pinDefault: false,
  offline: true,
};

export default manifest;
