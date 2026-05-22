import type { ToolManifest } from '@/lib/registry/types';

export const manifest: ToolManifest = {
  id: 'calc-percent',
  name: 'Percent Calculator',
  blurb: 'Find a percent of, percent change, or what percent X is of Y.',
  category: 'calc',
  tile: 'M',
  icon: 'percent',
  compute: 'instant',
  keywords: ['percent', 'percentage', 'percent change', 'tip'],
  offline: true,
  pinDefault: true,
};

export default manifest;
