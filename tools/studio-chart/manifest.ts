import type { ToolManifest } from '@/lib/registry/types';

export const manifest: ToolManifest = {
  id: 'studio-chart',
  name: 'Chart Maker',
  blurb: 'Turn data into clean bar, line, area or pie charts — paste rows or import CSV, then export PNG or SVG. All in your browser.',
  category: 'generator',
  tile: 'L',
  icon: 'bar-chart',
  compute: 'instant',
  produces: ['image/png', 'image/svg+xml'],
  keywords: ['chart maker', 'graph maker', 'bar chart', 'line graph', 'pie chart', 'csv to chart', 'data visualization'],
  offline: true,
};

export default manifest;
