import type { ToolManifest } from '@/lib/registry/types';
export const manifest: ToolManifest = {
  id: 'calc-integral',
  name: 'Integral Calculator',
  blurb: 'Definite integration via numerical methods — fast and accurate for any continuous function.',
  category: 'calc', tile: 'M', icon: 'graph', compute: 'instant',
  keywords: ['integral', 'integration', 'calculus', 'definite', 'numerical'], offline: true,
};
export default manifest;
