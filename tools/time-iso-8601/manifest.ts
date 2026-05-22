import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'time-iso-8601',
  name: 'ISO 8601 Formatter',
  blurb: 'Format any date as ISO 8601 — extended, basic, with timezone offsets.',
  category: 'time', tile: 'S', icon: 'clock', compute: 'instant',
  keywords: ['iso 8601', 'rfc 3339', 'date format', 'utc'], offline: true,
};
export default manifest;
