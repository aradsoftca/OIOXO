import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'calc-matrix',
  name: 'Matrix Calculator',
  blurb: 'Multiply, invert, transpose, determinant — works for any square or rectangular matrix.',
  category: 'calc', tile: 'M', icon: 'grid', compute: 'instant',
  keywords: ['matrix', 'linear algebra', 'determinant', 'inverse', 'transpose'], offline: true,
};
export default manifest;
