/**
 * STL (ASCII or binary) → OpenSCAD polyhedron(). Vertices are de-duplicated so
 * the result is a connected mesh OpenSCAD can render and union.
 */

export interface Mesh { points: [number, number, number][]; faces: [number, number, number][] }

export function parseStl(bytes: Uint8Array): Mesh {
  const tris: number[][] = [];
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = bytes.length >= 84 ? dv.getUint32(80, true) : -1;
  const isBinary = count >= 0 && bytes.length === 84 + count * 50;
  if (isBinary) {
    for (let i = 0; i < count; i++) {
      const o = 84 + i * 50 + 12;   // skip the normal
      const t: number[] = [];
      for (let k = 0; k < 9; k++) t.push(dv.getFloat32(o + k * 4, true));
      tris.push(t);
    }
  } else {
    const text = new TextDecoder('utf-8').decode(bytes);
    if (!/^\s*solid/i.test(text) && !/\bfacet\b/i.test(text)) throw new Error('Not an STL file.');
    const re = /vertex\s+(\S+)\s+(\S+)\s+(\S+)/gi;
    let cur: number[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      cur.push(Number(m[1]), Number(m[2]), Number(m[3]));
      if (cur.length === 9) { tris.push(cur); cur = []; }
    }
  }
  if (!tris.length) throw new Error('The STL contains no triangles.');

  const index = new Map<string, number>();
  const points: Mesh['points'] = [];
  const faces: Mesh['faces'] = [];
  const vid = (x: number, y: number, z: number): number => {
    const key = `${x},${y},${z}`;
    let i = index.get(key);
    if (i === undefined) { i = points.length; index.set(key, i); points.push([x, y, z]); }
    return i;
  };
  for (const t of tris) {
    if (t.some((n) => !Number.isFinite(n))) continue;
    const a = vid(t[0], t[1], t[2]), b = vid(t[3], t[4], t[5]), c = vid(t[6], t[7], t[8]);
    if (a === b || b === c || a === c) continue;   // degenerate
    faces.push([a, b, c]);
  }
  return { points, faces };
}

const num = (n: number): string => String(Number(n.toPrecision(7)));

/** OpenSCAD source. STL winds counter-clockwise seen from outside; OpenSCAD wants clockwise. */
export function meshToScad(mesh: Mesh, name = 'model'): string {
  const pts = mesh.points.map((p) => `      [${num(p[0])}, ${num(p[1])}, ${num(p[2])}]`).join(',\n');
  const fcs = mesh.faces.map((f) => `      [${f[0]}, ${f[2]}, ${f[1]}]`).join(',\n');
  const mod = name.replace(/[^A-Za-z0-9_]/g, '_').replace(/^(\d)/, '_$1') || 'model';
  return `// Converted from ${name}.stl — ${mesh.points.length} points, ${mesh.faces.length} faces\n`
    + `module ${mod}() {\n  polyhedron(\n    points = [\n${pts}\n    ],\n    faces = [\n${fcs}\n    ],\n    convexity = 10\n  );\n}\n\n${mod}();\n`;
}

export function stlToScad(bytes: Uint8Array, name: string): string {
  return meshToScad(parseStl(bytes), name);
}
