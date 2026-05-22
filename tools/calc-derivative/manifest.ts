import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'calc-derivative',
  name: 'Derivative Calculator',
  blurb: 'Symbolic differentiation with step-by-step output — single or multi-variable.',
  category: 'calc', tile: 'M', icon: 'graph', compute: 'instant',
  keywords: ['derivative', 'calculus', 'differentiation', 'math'], offline: true,
};
export default manifest;
