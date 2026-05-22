import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'calc-hex',
  name: 'Hex Calculator',
  blurb: 'Convert between binary, octal, decimal, and hexadecimal.',
  category: 'calc', tile: 'M', icon: 'hash', compute: 'instant',
  keywords: ['hex', 'hexadecimal', 'binary', 'octal', 'base converter'], offline: true,
};
export default manifest;
