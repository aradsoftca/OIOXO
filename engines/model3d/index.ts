/**
 * 3D model engine — convert 40+ formats to glTF/GLB in the browser via
 * assimpjs (Assimp compiled to WASM). No server, no GPU. The wasm is served
 * from /public/assimpjs/.
 */

export type Model3dTarget = 'glb' | 'gltf';

export interface Model3dResult {
  files: { name: string; data: Uint8Array }[];
}

// Formats Assimp can import (common subset surfaced in the UI).
export const MODEL3D_INPUTS = [
  'obj', 'stl', 'fbx', 'dae', 'ply', '3ds', 'gltf', 'glb', '3mf',
  'x', 'x3d', 'off', 'ms3d', 'lwo', 'lws', 'ac', 'blend', 'ifc', 'dxf',
];

interface AssimpFile { GetName(): string; GetContent(): Uint8Array }
interface AssimpResult {
  IsSuccess(): boolean;
  GetErrorCode(): string;
  FileCount(): number;
  GetFile(i: number): AssimpFile;
}
interface AssimpModule {
  FileList: new () => { AddFile(name: string, content: Uint8Array): void };
  ConvertFileList(list: unknown, format: string): AssimpResult;
}

let cached: Promise<AssimpModule> | null = null;
async function getAssimp(): Promise<AssimpModule> {
  if (!cached) {
    const p = (async () => {
      const mod = await import('assimpjs');
      const factory = (mod as unknown as { default?: (o?: unknown) => Promise<AssimpModule> }).default
        ?? (mod as unknown as (o?: unknown) => Promise<AssimpModule>);
      return factory({ locateFile: (f: string) => `/assimpjs/${f}` });
    })();
    // Clear the cache on rejection so a transient WASM load failure doesn't
    // memoise a broken promise forever.
    p.catch(() => { cached = null; });
    cached = p;
  }
  return cached;
}

/**
 * Convert a model. Pass the primary model file plus any sidecars it references
 * (e.g. an .obj's .mtl, textures) so Assimp can resolve them.
 */
export async function convertModel(
  files: { name: string; data: Uint8Array }[],
  target: Model3dTarget,
): Promise<Model3dResult> {
  const ajs = await getAssimp();
  const list = new ajs.FileList();
  for (const f of files) list.AddFile(f.name, f.data);
  const fmt = target === 'glb' ? 'glb2' : 'gltf2';
  const result = ajs.ConvertFileList(list, fmt);
  if (!result.IsSuccess()) {
    throw new Error(`Could not convert this model (${result.GetErrorCode() || 'unknown error'})`);
  }
  const out: { name: string; data: Uint8Array }[] = [];
  const n = result.FileCount();
  for (let i = 0; i < n; i++) {
    const file = result.GetFile(i);
    out.push({ name: file.GetName(), data: file.GetContent() });
  }
  return { files: out };
}
