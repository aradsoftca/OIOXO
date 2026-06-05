import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'test-mouse', name: 'Mouse Test',
  blurb: 'Test mouse buttons, scroll wheel, double-click speed, and estimate your polling rate (Hz).',
  category: 'test', tile: 'M', icon: 'mouse', compute: 'instant',
  keywords: ['mouse test', 'polling rate', 'mouse hz', 'double click test', 'scroll test', 'mouse button test'], offline: true, pinDefault: true,
};
export default manifest;
