import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'time-unix-timestamp',
  name: 'Unix Timestamp',
  blurb: 'Convert between Unix timestamps and human-readable dates.',
  category: 'time', tile: 'M', icon: 'clock', compute: 'instant',
  keywords: ['unix timestamp', 'epoch', 'date converter'], offline: true,
};
export default manifest;
