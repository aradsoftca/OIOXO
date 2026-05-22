import type { ToolManifest } from '@/lib/registry/types';

export const manifest: ToolManifest = {
  id: 'calc-scientific',
  name: 'Scientific Calculator',
  blurb: 'Trig, logs, powers, roots, factorial — degrees or radians.',
  category: 'calc',
  tile: 'M',
  icon: 'calculator',
  compute: 'instant',
  keywords: ['scientific calculator', 'trigonometry', 'logarithm', 'sin cos tan', 'square root', 'factorial'],
  pinDefault: false,
  offline: true,
};

export default manifest;
