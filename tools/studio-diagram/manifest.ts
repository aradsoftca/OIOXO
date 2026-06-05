import type { ToolManifest } from '@/lib/registry/types';

export const manifest: ToolManifest = {
  id: 'studio-diagram',
  name: 'Diagram Studio',
  blurb: 'Sketch flowcharts and mind maps — add boxes, drag them, connect with arrows, and export PNG or SVG. Runs entirely in your browser.',
  category: 'generator',
  tile: 'L',
  icon: 'workflow',
  compute: 'instant',
  produces: ['image/png', 'image/svg+xml'],
  keywords: ['flowchart maker', 'diagram maker', 'mind map', 'mindmap online', 'flow chart', 'node diagram', 'org chart'],
  offline: true,
};

export default manifest;
