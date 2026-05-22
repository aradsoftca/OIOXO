import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'audio-remove-silence',
  name: 'Remove Silence',
  blurb: 'Trim silent gaps from start, end, or throughout — tighten any recording.',
  category: 'audio', tile: 'M', icon: 'scissors', compute: 'local',
  accepts: ['audio/*'],
  produces: ['audio/mp3'],
  keywords: ['audio', 'silence', 'trim', 'remove', 'edit'], offline: true,
};
export default manifest;
