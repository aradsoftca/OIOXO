import type { ToolManifest } from '@/lib/registry/types';

export const manifest: ToolManifest = {
  id: 'video-bitrate',
  name: 'Change Video Bitrate',
  blurb: 'Re-encode to a target bitrate — dial in an exact file size or quality.',
  category: 'video',
  tile: 'M',
  icon: 'gauge',
  compute: 'local',
  accepts: ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-matroska', 'video/x-msvideo'],
  produces: ['video/mp4'],
  keywords: ['video bitrate', 'target bitrate', 'reduce size', 'video quality', 're-encode'],
  pinDefault: false,
  offline: true,
};

export default manifest;
