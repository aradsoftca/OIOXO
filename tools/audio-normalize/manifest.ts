import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'audio-normalize',
  name: 'Normalize Audio',
  blurb: 'Bring quiet tracks up to a consistent loudness — no clipping.',
  category: 'audio', tile: 'M', icon: 'gauge', compute: 'local',
  accepts: ['audio/*'],
  produces: ['audio/wav', 'audio/mp3'],
  keywords: ['audio', 'normalize', 'loudness', 'peak', 'level'], offline: true,
};
export default manifest;
