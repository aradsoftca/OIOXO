import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'gen-glassmorphism',
  name: 'Glassmorphism',
  blurb: 'Frosted-glass card with backdrop blur — copy the CSS that makes it work.',
  category: 'generator', tile: 'M', icon: 'square', compute: 'instant',
  keywords: ['css', 'glass', 'glassmorphism', 'frosted', 'backdrop-filter'], offline: true,
};
export default manifest;
