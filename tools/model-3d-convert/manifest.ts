import type { ToolManifest } from '@/lib/registry/types';

export const manifest: ToolManifest = {
  id: 'model-3d-convert',
  name: '3D Model Converter',
  blurb: 'Convert OBJ, STL, FBX, DAE, PLY and 40+ formats to glTF/GLB for the web — on your device.',
  category: 'convert',
  tile: 'L',
  icon: 'box',
  compute: 'local',
  accepts: ['.obj', '.stl', '.fbx', '.dae', '.ply', '.3ds', '.gltf', '.glb', '.3mf'],
  produces: ['model/gltf-binary', 'model/gltf+json'],
  keywords: ['3d converter', 'obj to glb', 'stl to glb', 'fbx to gltf', 'glb', 'gltf', '3d model', 'three.js'],
  pinDefault: false,
  offline: true,
};

export default manifest;
