import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'test-touch', name: 'Touchscreen Test',
  blurb: 'Check your touchscreen and multi-touch — every finger you place shows up, with a max simultaneous-touch count.',
  category: 'test', tile: 'M', icon: 'fingerprint', compute: 'instant',
  keywords: ['touch test', 'touchscreen test', 'multitouch test', 'digitizer test', 'touch points'], offline: true,
};
export default manifest;
