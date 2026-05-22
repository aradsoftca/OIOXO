import type { ToolManifest } from '@/lib/registry/types';

export const manifest: ToolManifest = {
  id: 'cad-convert',
  name: 'CAD to Mesh',
  blurb: 'Convert STEP, IGES and BREP CAD files to STL or OBJ — ready for 3D printing or the web.',
  category: 'convert',
  tile: 'L',
  icon: 'box',
  compute: 'local',
  accepts: ['.step', '.stp', '.iges', '.igs', '.brep'],
  produces: ['model/stl', 'model/obj'],
  keywords: ['step to stl', 'iges to stl', 'step to obj', 'cad converter', 'cad to mesh', '3d printing', 'brep'],
  pinDefault: false,
  offline: true,
};

export default manifest;
