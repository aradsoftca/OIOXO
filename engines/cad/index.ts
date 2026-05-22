/**
 * CAD engine — read STEP / IGES / BREP with occt-import-js (OpenCASCADE WASM),
 * which tessellates the B-rep into three.js-style meshes. We then write those
 * meshes out as STL or OBJ (simple text formats). No GPU, no server.
 * The wasm is served from /public/occt/.
 */

export type CadInputKind = 'step' | 'iges' | 'brep';
export type CadTarget = 'stl' | 'obj';

interface OcctMesh {
  name?: string;
  attributes: { position: { array: number[] }; normal?: { array: number[] } };
  index: { array: number[] };
}
interface OcctResult { success: boolean; meshes: OcctMesh[] }
interface OcctModule {
  ReadStepFile(buf: Uint8Array, params: unknown): OcctResult;
  ReadIgesFile(buf: Uint8Array, params: unknown): OcctResult;
  ReadBrepFile(buf: Uint8Array, params: unknown): OcctResult;
}

let cached: Promise<OcctModule> | null = null;
async function getOcct(): Promise<OcctModule> {
  if (!cached) {
    cached = (async () => {
      const mod = await import('occt-import-js');
      const factory = (mod as unknown as { default?: (o?: unknown) => Promise<OcctModule> }).default
        ?? (mod as unknown as (o?: unknown) => Promise<OcctModule>);
      return factory({ locateFile: (f: string) => `/occt/${f}` });
    })();
  }
  return cached;
}

export function cadKind(ext: string): CadInputKind | null {
  if (ext === 'step' || ext === 'stp') return 'step';
  if (ext === 'iges' || ext === 'igs') return 'iges';
  if (ext === 'brep') return 'brep';
  return null;
}

export async function readCadBuffer(buf: Uint8Array, kind: CadInputKind): Promise<OcctMesh[]> {
  const occt = await getOcct();
  const result = kind === 'iges' ? occt.ReadIgesFile(buf, null)
    : kind === 'brep' ? occt.ReadBrepFile(buf, null)
    : occt.ReadStepFile(buf, null);
  if (!result.success || !result.meshes?.length) throw new Error('Could not read this CAD file (no geometry found).');
  return result.meshes;
}

export async function readCad(file: File, kind: CadInputKind): Promise<OcctMesh[]> {
  return readCadBuffer(new Uint8Array(await file.arrayBuffer()), kind);
}

export interface CadConvertResult { text: string; stats: { parts: number; triangles: number } }

/** Read + tessellate + serialize in one pass. Pure (no DOM) — safe in a worker. */
export async function convertCadBuffer(buf: Uint8Array, kind: CadInputKind, target: CadTarget): Promise<CadConvertResult> {
  const meshes = await readCadBuffer(buf, kind);
  const stats = meshStats(meshes);
  const text = target === 'stl' ? meshesToStl(meshes) : meshesToObj(meshes);
  return { text, stats };
}

export function meshesToObj(meshes: OcctMesh[]): string {
  const lines: string[] = ['# Exported by Xonvert'];
  let vOffset = 1;
  meshes.forEach((m, mi) => {
    const pos = m.attributes.position.array;
    const idx = m.index.array;
    lines.push(`o ${m.name || `part_${mi + 1}`}`);
    for (let i = 0; i < pos.length; i += 3) lines.push(`v ${pos[i]} ${pos[i + 1]} ${pos[i + 2]}`);
    for (let i = 0; i < idx.length; i += 3) {
      lines.push(`f ${idx[i] + vOffset} ${idx[i + 1] + vOffset} ${idx[i + 2] + vOffset}`);
    }
    vOffset += pos.length / 3;
  });
  return lines.join('\n');
}

export function meshesToStl(meshes: OcctMesh[]): string {
  const out: string[] = ['solid xonvert'];
  for (const m of meshes) {
    const p = m.attributes.position.array;
    const idx = m.index.array;
    for (let i = 0; i < idx.length; i += 3) {
      const a = idx[i] * 3, b = idx[i + 1] * 3, c = idx[i + 2] * 3;
      const ax = p[a], ay = p[a + 1], az = p[a + 2];
      const bx = p[b], by = p[b + 1], bz = p[b + 2];
      const cx = p[c], cy = p[c + 1], cz = p[c + 2];
      // face normal = (b-a) × (c-a), normalized
      const ux = bx - ax, uy = by - ay, uz = bz - az;
      const vx = cx - ax, vy = cy - ay, vz = cz - az;
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const len = Math.hypot(nx, ny, nz) || 1; nx /= len; ny /= len; nz /= len;
      out.push(`facet normal ${nx} ${ny} ${nz}`, 'outer loop',
        `vertex ${ax} ${ay} ${az}`, `vertex ${bx} ${by} ${bz}`, `vertex ${cx} ${cy} ${cz}`,
        'endloop', 'endfacet');
    }
  }
  out.push('endsolid xonvert');
  return out.join('\n');
}

export function meshStats(meshes: OcctMesh[]): { parts: number; triangles: number } {
  let tris = 0;
  for (const m of meshes) tris += m.index.array.length / 3;
  return { parts: meshes.length, triangles: tris };
}
