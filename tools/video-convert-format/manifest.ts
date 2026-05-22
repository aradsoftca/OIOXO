import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'video-convert-format',
  name: 'Convert Video Format',
  blurb: 'Convert between MP4, WebM, MOV, MKV — proper re-encoding, plays anywhere.',
  category: 'video', tile: 'L', icon: 'file-video-2', compute: 'local',
  accepts: ['video/*'],
  produces: ['video/mp4', 'video/webm'],
  keywords: ['video', 'convert', 'mp4', 'webm', 'mov', 'mkv', 'format'], offline: true, pinDefault: true,
};
export default manifest;
