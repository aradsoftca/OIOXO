import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'calc-binary',
  name: 'Binary Calculator',
  blurb: 'Add, subtract, AND, OR, XOR, shift — binary arithmetic & logic.',
  category: 'calc', tile: 'M', icon: 'binary', compute: 'instant',
  keywords: ['binary', 'bit', 'bitwise', 'AND', 'OR', 'XOR', 'shift'], offline: true,
};
export default manifest;
