import type { ToolManifest } from '@/lib/registry/types';

export const manifest: ToolManifest = {
  id: 'convert-anything',
  name: 'Convert Anything',
  blurb: 'Drop any file — we show every format you can turn it into and convert it on your device.',
  category: 'convert',
  tile: 'W',
  icon: 'shuffle',
  compute: 'local',
  accepts: ['image/*', 'audio/*', 'video/*', 'application/pdf'],
  produces: ['image/png', 'image/jpeg', 'image/webp', 'audio/mpeg', 'audio/wav', 'video/mp4', 'video/webm', 'application/pdf', 'text/plain'],
  keywords: ['convert', 'universal converter', 'any format', 'file converter', 'convert anything', 'change format'],
  pinDefault: true,
  offline: false,
};

export default manifest;
