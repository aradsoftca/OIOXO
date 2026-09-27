import type { Metadata } from 'next';
import Link from 'next/link';
import { SectionTitle } from '@/components/layout/SectionTitle';
import { buildMeta } from '@/lib/seo/meta';
import { CAD3D_PAIRS, CAD3D_FORMATS } from '@/lib/convert/cad3d';

export const metadata: Metadata = buildMeta({
  path: '/cad-3d',
  title: 'CAD & 3D file converter — DWG, STEP, STL, GLB, private',
  description:
    'Convert DWG to DXF, STEP and IGES to STL or OBJ, and FBX, OBJ, STL, PLY or 3MF to GLB — in your browser. Your designs are never uploaded.',
  keywords: ['cad converter', 'step to stl', 'dwg to dxf', 'fbx to glb', 'obj to glb', '3d model converter', 'private cad converter'],
});

const GROUPS: { title: string; blurb: string; tool: string; match: (p: { from: string; to: string }) => boolean }[] = [
  {
    title: 'AutoCAD drawings',
    blurb: 'Open DWG drawings without AutoCAD by converting them to the documented DXF format.',
    tool: 'convert-anything',
    match: (p) => p.from === 'dwg',
  },
  {
    title: 'CAD solids to printable meshes',
    blurb: 'STEP, IGES and BREP hold exact engineering geometry. Mesh them to STL for slicers or OBJ for render tools.',
    tool: 'cad-convert',
    match: (p) => ['step', 'stp', 'iges', 'igs', 'brep'].includes(p.from),
  },
  {
    title: '3D models to glTF / GLB',
    blurb: 'Bring OBJ, STL, FBX, COLLADA, PLY, 3DS and 3MF models to the web, AR and modern engines.',
    tool: 'model-3d-convert',
    match: (p) => ['glb', 'gltf'].includes(p.to),
  },
];

export default function Cad3dHub() {
  return (
    <div className="space-y-10">
      <header className="space-y-3">
        <SectionTitle label="CAD & 3D" colorVar="--color-cat-convert" />
        <h1 className="text-[40px] font-bold tracking-tight text-[var(--color-fg)]">CAD &amp; 3D file converter</h1>
        <p className="max-w-3xl text-[15px] leading-relaxed text-[var(--color-fg-muted)]">
          Engineering drawings and product models are often confidential. Every converter here runs inside your browser
          with open-source engines compiled to WebAssembly — LibreDWG for AutoCAD drawings, Open CASCADE for STEP, IGES and
          BREP solids, and Assimp for mesh formats. Your file is processed on your own device and never uploaded, so there
          is nothing to trust us with.
        </p>
      </header>

      {GROUPS.map((g) => {
        const pairs = CAD3D_PAIRS.filter(g.match);
        return (
          <section key={g.title} className="space-y-3">
            <div className="border-b border-black/[0.08] pb-2">
              <h2 className="text-[24px] font-bold tracking-tight text-[var(--color-fg)]">{g.title}</h2>
              <p className="text-[14px] text-[var(--color-fg-muted)]">
                {g.blurb}{' '}
                <Link prefetch={false} href={`/tools/${g.tool}`} className="underline underline-offset-2">Open the full tool</Link>.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-[2px] md:grid-cols-3 lg:grid-cols-5">
              {pairs.map((p) => (
                <Link prefetch={false}
                  key={`${p.from}-${p.to}`}
                  href={`/convert/${p.from}-to-${p.to}`}
                  className="flex items-baseline gap-1.5 border border-black/[0.08] bg-[var(--color-surface-1)] px-4 py-3 font-mono text-[14px] font-semibold tracking-tight transition hover:bg-[var(--color-surface-2)]"
                >
                  {p.from.toUpperCase()} <span className="text-[var(--color-fg-subtle)]">→</span> {p.to.toUpperCase()}
                </Link>
              ))}
            </div>
          </section>
        );
      })}

      <section className="space-y-4">
        <h2 className="text-[24px] font-bold tracking-tight text-[var(--color-fg)]">The formats, briefly</h2>
        <dl className="grid gap-4 md:grid-cols-2">
          {Object.entries(CAD3D_FORMATS).filter(([k]) => !['stp', 'igs'].includes(k)).map(([k, f]) => (
            <div key={k} className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4">
              <dt className="text-[15px] font-semibold text-[var(--color-fg)]">{f.name}</dt>
              <dd className="mt-1 text-[13px] leading-relaxed text-[var(--color-fg-muted)]">{f.what}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
