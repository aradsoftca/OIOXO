import type { ToolManifest } from '@/lib/registry/types';

export const manifest: ToolManifest = {
  id: 'video-reverse',
  name: 'Reverse Video',
  blurb: 'Play any clip backwards — video and audio reversed together.',
  category: 'video',
  tile: 'M',
  icon: 'rewind',
  compute: 'local',
  accepts: ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-matroska', 'video/x-msvideo'],
  produces: ['video/mp4'],
  keywords: ['reverse video', 'backwards', 'rewind', 'play backward'],
  pinDefault: false,
  offline: true,
};

export default manifest;
