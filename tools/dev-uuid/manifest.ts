import type { ToolManifest } from '@/lib/registry/types';

export const manifest: ToolManifest = {
  id: 'dev-uuid',
  name: 'UUID Generator',
  blurb: 'Generate UUIDv4 / v7 identifiers in bulk — cryptographically random.',
  category: 'dev',
  accepts: ['text/*'],
  tile: 'M',
  icon: 'fingerprint',
  compute: 'instant',
  keywords: ['uuid', 'guid', 'random id', 'v4', 'v7'],
  offline: true,
};

export default manifest;
