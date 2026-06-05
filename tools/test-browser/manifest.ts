import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'test-browser', name: 'Browser Checkup',
  blurb: 'See what your browser and device report — screen, cores, memory, supported features, and privacy signals.',
  category: 'test', tile: 'M', icon: 'globe', compute: 'instant',
  keywords: ['browser test', 'what is my browser', 'browser features', 'webgl test', 'device info', 'screen resolution', 'user agent'], offline: true,
};
export default manifest;
