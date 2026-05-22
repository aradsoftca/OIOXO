import type { ToolManifest } from '@/lib/registry/types';

export const manifest: ToolManifest = {
  id: 'calc-bmi',
  name: 'BMI Calculator',
  blurb: 'Body Mass Index with category and healthy weight range.',
  category: 'calc',
  tile: 'M',
  icon: 'scale',
  compute: 'instant',
  keywords: ['bmi', 'body mass index', 'weight'],
  offline: true,
};

export default manifest;
