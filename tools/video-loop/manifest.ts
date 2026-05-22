import type { ToolManifest } from '@/lib/registry/types';

export const manifest: ToolManifest = {
  id: 'video-loop',
  name: 'Loop Video',
  blurb: 'Repeat a clip a few times back-to-back into one longer video.',
  category: 'video',
  tile: 'M',
  icon: 'repeat',
  compute: 'local',
  accepts: ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-matroska', 'video/x-msvideo'],
  produces: ['video/mp4'],
  keywords: ['loop video', 'repeat video', 'duplicate clip', 'extend video'],
  pinDefault: false,
  offline: true,
};

export default manifest;
