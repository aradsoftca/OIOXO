import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'test-cps', name: 'Click Speed Test (CPS)',
  blurb: 'How many clicks per second can you do? Pick a duration and click as fast as you can.',
  category: 'test', tile: 'M', icon: 'mouse-pointer-click', compute: 'instant',
  keywords: ['cps test', 'click speed', 'clicks per second', 'click test', 'jitter click', 'spacebar test'], offline: true, pinDefault: true,
};
export default manifest;
