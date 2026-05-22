import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'gen-animation',
  name: 'CSS Animation',
  blurb: 'Compose @keyframes visually — pick easing, duration, and direction.',
  category: 'generator', tile: 'M', icon: 'play', compute: 'instant',
  keywords: ['css', 'animation', 'keyframes', 'transition', 'easing'], offline: true,
};
export default manifest;
