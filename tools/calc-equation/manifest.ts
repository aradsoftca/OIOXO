import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'calc-equation',
  name: 'Equation Solver',
  blurb: 'Solve linear systems, polynomial roots, and single-variable equations.',
  category: 'calc', tile: 'M', icon: 'equals', compute: 'instant',
  keywords: ['equation', 'solver', 'roots', 'linear', 'system', 'polynomial'], offline: true,
};
export default manifest;
