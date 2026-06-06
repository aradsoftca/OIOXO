'use client';

/**
 * Diagram Studio — oioxo / newxonvert version.
 * An SVG canvas: add boxes, drag to position, connect with arrows, recolour,
 * and export PNG or SVG. Fully on-device.
 */

import * as React from 'react';
import { Plus, Link2, Trash2, Download, LayoutGrid } from 'lucide-react';
import { brandSvg } from '@/lib/watermark/download';
import { enforcePolicy } from '@/lib/limits/server-check';
import { usePolicyGate } from '@/components/limits/PolicyGate';
import { useIsPro } from '@/lib/limits/use-is-pro';

const POLICY_KEY = 'studio-diagram';

type Shape = 'rect' | 'pill' | 'ellipse' | 'diamond';
interface Node { id: string; x: number; y: number; text: string; color: number; shape?: Shape; }
interface Edge { from: string; to: string; }

const VW = 1000, VH = 620, NW = 150, NH = 60;
const SHAPES: { id: Shape; label: string }[] = [
  { id: 'rect', label: 'Box' }, { id: 'pill', label: 'Pill' },
  { id: 'ellipse', label: 'Oval' }, { id: 'diamond', label: 'Decision' },
];

// Clip an edge endpoint to a node's border (so arrows touch the box, not its
// center) — a simple box/diamond intersection along the line to the other center.
function borderPoint(n: Node, towards: { x: number; y: number }): { x: number; y: number } {
  const cx = n.x + NW / 2, cy = n.y + NH / 2;
  const dx = towards.x - cx, dy = towards.y - cy;
  if (dx === 0 && dy === 0) return { x: cx, y: cy };
  if ((n.shape ?? 'rect') === 'diamond') {
    // Diamond: |x|/(w/2) + |y|/(h/2) = 1.
    const t = 1 / (Math.abs(dx) / (NW / 2) + Math.abs(dy) / (NH / 2));
    return { x: cx + dx * t, y: cy + dy * t };
  }
  if ((n.shape ?? 'rect') === 'ellipse') {
    const t = 1 / Math.sqrt((dx * dx) / ((NW / 2) ** 2) + (dy * dy) / ((NH / 2) ** 2));
    return { x: cx + dx * t, y: cy + dy * t };
  }
  // rect / pill: scale to the nearer axis.
  const sx = (NW / 2) / Math.abs(dx), sy = (NH / 2) / Math.abs(dy);
  const t = Math.min(sx, sy);
  return { x: cx + dx * t, y: cy + dy * t };
}
const COLORS = ['#2563eb', '#16a34a', '#f59e0b', '#db2777', '#7c3aed', '#475569'];
const uid = () => Math.random().toString(36).slice(2, 9);

function NodeShape({ n, stroke }: { n: Node; stroke: string }) {
  const fill = COLORS[n.color];
  const sw = 3;
  const sh = n.shape ?? 'rect';
  if (sh === 'ellipse') return <ellipse cx={n.x + NW / 2} cy={n.y + NH / 2} rx={NW / 2} ry={NH / 2} fill={fill} stroke={stroke} strokeWidth={sw} />;
  if (sh === 'pill') return <rect x={n.x} y={n.y} width={NW} height={NH} rx={NH / 2} fill={fill} stroke={stroke} strokeWidth={sw} />;
  if (sh === 'diamond') {
    const cx = n.x + NW / 2, cy = n.y + NH / 2;
    return <polygon points={`${cx},${n.y} ${n.x + NW},${cy} ${cx},${n.y + NH} ${n.x},${cy}`} fill={fill} stroke={stroke} strokeWidth={sw} />;
  }
  return <rect x={n.x} y={n.y} width={NW} height={NH} rx={10} fill={fill} stroke={stroke} strokeWidth={sw} />;
}

export default function DiagramStudioUI() {
  const isPro = useIsPro();
  const policyGate = usePolicyGate();
  const [nodes, setNodes] = React.useState<Node[]>([
    { id: 'a', x: 420, y: 80, text: 'Start', color: 0 },
    { id: 'b', x: 420, y: 280, text: 'Process', color: 1 },
    { id: 'c', x: 420, y: 480, text: 'End', color: 5 },
  ]);
  const [edges, setEdges] = React.useState<Edge[]>([{ from: 'a', to: 'b' }, { from: 'b', to: 'c' }]);
  const [selected, setSelected] = React.useState<string | null>('a');
  const [linkMode, setLinkMode] = React.useState(false);
  const [linkFrom, setLinkFrom] = React.useState<string | null>(null);

  const svgRef = React.useRef<SVGSVGElement>(null);
  const dragRef = React.useRef<{ id: string; dx: number; dy: number } | null>(null);

  const toSvg = (clientX: number, clientY: number) => {
    const r = svgRef.current!.getBoundingClientRect();
    return { x: (clientX - r.left) / r.width * VW, y: (clientY - r.top) / r.height * VH };
  };

  const onNodeDown = (e: React.PointerEvent, n: Node) => {
    e.stopPropagation();
    setSelected(n.id);
    if (linkMode) {
      if (linkFrom && linkFrom !== n.id) {
        setEdges((es) => (es.some((x) => x.from === linkFrom && x.to === n.id) ? es : [...es, { from: linkFrom, to: n.id }]));
        setLinkFrom(null); setLinkMode(false);
      } else setLinkFrom(n.id);
      return;
    }
    const p = toSvg(e.clientX, e.clientY);
    dragRef.current = { id: n.id, dx: p.x - n.x, dy: p.y - n.y };
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    const d = dragRef.current; if (!d) return;
    const p = toSvg(e.clientX, e.clientY);
    setNodes((ns) => ns.map((n) => (n.id === d.id ? { ...n, x: Math.max(0, Math.min(VW - NW, p.x - d.dx)), y: Math.max(0, Math.min(VH - NH, p.y - d.dy)) } : n)));
  };
  const onUp = () => { dragRef.current = null; };

  const addNode = (shape: Shape = 'rect') => { const id = uid(); setNodes((ns) => [...ns, { id, x: 60 + Math.random() * 200, y: 60 + Math.random() * 120, text: 'New', color: ns.length % COLORS.length, shape }]); setSelected(id); };
  const del = () => { if (!selected) return; setNodes((ns) => ns.filter((n) => n.id !== selected)); setEdges((es) => es.filter((e) => e.from !== selected && e.to !== selected)); setSelected(null); };

  // Auto-layout: layered top-to-bottom DAG arrangement. Each node's layer =
  // longest path from a root (no incoming edge); nodes spread evenly within
  // their layer. Cycle-safe (a visiting guard breaks cycles at 0).
  const autoLayout = () => {
    setNodes((ns) => {
      if (!ns.length) return ns;
      const ids = ns.map((n) => n.id);
      const incoming = new Map<string, string[]>(ids.map((id) => [id, [] as string[]]));
      for (const e of edges) if (incoming.has(e.to)) incoming.get(e.to)!.push(e.from);
      const layer = new Map<string, number>();
      const visiting = new Set<string>();
      const depth = (id: string): number => {
        if (layer.has(id)) return layer.get(id)!;
        if (visiting.has(id)) return 0;
        visiting.add(id);
        const preds = incoming.get(id) ?? [];
        const d = preds.length ? Math.max(...preds.map((p) => depth(p) + 1)) : 0;
        visiting.delete(id);
        layer.set(id, d);
        return d;
      };
      ids.forEach(depth);
      const byLayer = new Map<number, string[]>();
      for (const id of ids) { const L = layer.get(id) ?? 0; if (!byLayer.has(L)) byLayer.set(L, []); byLayer.get(L)!.push(id); }
      const layers = [...byLayer.keys()].sort((a, b) => a - b);
      const rowGap = Math.max(NH + 50, Math.min(180, (VH - NH) / Math.max(1, layers.length)));
      const pos = new Map<string, { x: number; y: number }>();
      layers.forEach((L, li) => {
        const row = byLayer.get(L)!;
        const colGap = VW / (row.length + 1);
        row.forEach((id, ci) => pos.set(id, { x: Math.max(0, Math.min(VW - NW, colGap * (ci + 1) - NW / 2)), y: 40 + li * rowGap }));
      });
      return ns.map((n) => { const p = pos.get(n.id); return p ? { ...n, x: p.x, y: p.y } : n; });
    });
  };

  const sel = nodes.find((n) => n.id === selected) || null;
  const center = (n: Node) => ({ x: n.x + NW / 2, y: n.y + NH / 2 });

  const svgMarkup = () => {
    const parts: string[] = [`<svg xmlns="http://www.w3.org/2000/svg" width="${VW}" height="${VH}" viewBox="0 0 ${VW} ${VH}"><rect width="${VW}" height="${VH}" fill="#ffffff"/><defs><marker id="arr" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto"><path d="M0,0 L8,3 L0,6 Z" fill="#475569"/></marker></defs>`];
    edges.forEach((e) => { const a = nodes.find((n) => n.id === e.from), b = nodes.find((n) => n.id === e.to); if (!a || !b) return; const pa = borderPoint(a, center(b)), pb = borderPoint(b, center(a)); parts.push(`<line x1="${pa.x.toFixed(1)}" y1="${pa.y.toFixed(1)}" x2="${pb.x.toFixed(1)}" y2="${pb.y.toFixed(1)}" stroke="#94a3b8" stroke-width="2" marker-end="url(#arr)"/>`); });
    nodes.forEach((n) => {
      const c = COLORS[n.color];
      const cx = n.x + NW / 2, cy = n.y + NH / 2, sh = n.shape ?? 'rect';
      if (sh === 'ellipse') parts.push(`<ellipse cx="${cx}" cy="${cy}" rx="${NW / 2}" ry="${NH / 2}" fill="${c}"/>`);
      else if (sh === 'pill') parts.push(`<rect x="${n.x}" y="${n.y}" width="${NW}" height="${NH}" rx="${NH / 2}" fill="${c}"/>`);
      else if (sh === 'diamond') parts.push(`<polygon points="${cx},${n.y} ${n.x + NW},${cy} ${cx},${n.y + NH} ${n.x},${cy}" fill="${c}"/>`);
      else parts.push(`<rect x="${n.x}" y="${n.y}" width="${NW}" height="${NH}" rx="10" fill="${c}"/>`);
      parts.push(`<text x="${cx}" y="${cy}" fill="#fff" font-family="sans-serif" font-size="15" font-weight="600" text-anchor="middle" dominant-baseline="central">${n.text.replace(/[<>&]/g, (m) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[m] as string))}</text>`);
    });
    parts.push('</svg>');
    return parts.join('');
  };

  const downloadSvg = async () => {
    const ok = await enforcePolicy(POLICY_KEY, isPro, policyGate.fire, []);
    if (!ok) return;
    const blob = new Blob([brandSvg(svgMarkup())], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a');
    a.href = url; a.download = 'diagram.svg'; document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    // Defer revoke — mobile Safari/Firefox can abort the download if the
    // blob URL is torn down before the stream starts.
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };
  const downloadPng = async () => {
    const ok = await enforcePolicy(POLICY_KEY, isPro, policyGate.fire, []);
    if (!ok) return;
    const blob = new Blob([svgMarkup()], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas'); c.width = VW; c.height = VH;
      const ctx = c.getContext('2d'); if (ctx) { ctx.drawImage(img, 0, 0); const a = document.createElement('a'); a.href = c.toDataURL('image/png'); a.download = 'diagram.png'; document.body.appendChild(a); a.click(); document.body.removeChild(a); }
      URL.revokeObjectURL(url);
    };
    // Without an error path, a corrupt/oversized SVG never fires onload and
    // the blob URL stayed allocated for the rest of the tab's life. Revoke
    // either way so the leak is bounded.
    img.onerror = () => URL.revokeObjectURL(url);
    img.src = url;
  };

  const btn = 'flex items-center gap-2 border border-black/[0.08] px-3 py-2 text-[12px] font-bold uppercase tracking-wider text-[var(--color-fg)] transition hover:bg-[var(--color-surface-2)]';

  return (
    <div className="space-y-3">
      {policyGate.element}
      <div className="flex flex-wrap items-center gap-2">
        {SHAPES.map((s) => (
          <button key={s.id} type="button" className={btn} onClick={() => addNode(s.id)} title={`Add ${s.label}`}><Plus className="h-3.5 w-3.5" /> {s.label}</button>
        ))}
        <button type="button" className={`${btn} ${linkMode ? 'border-[var(--color-cat-generator)] bg-[var(--color-cat-generator)] text-white' : ''}`} onClick={() => { setLinkMode((v) => !v); setLinkFrom(null); }}><Link2 className="h-3.5 w-3.5" /> {linkMode ? (linkFrom ? 'Pick target' : 'Pick source') : 'Connect'}</button>
        <button type="button" className={btn} onClick={autoLayout} disabled={nodes.length < 2} title="Arrange nodes top-to-bottom by their connections"><LayoutGrid className="h-3.5 w-3.5" /> Auto-layout</button>
        <button type="button" className={btn} onClick={del} disabled={!selected}><Trash2 className="h-3.5 w-3.5" /> Delete</button>
        <span className="mx-1 h-5 w-px bg-black/[0.12]" />
        <button type="button" className={btn} onClick={downloadPng}><Download className="h-3.5 w-3.5" /> PNG</button>
        <button type="button" className={btn} onClick={downloadSvg}><Download className="h-3.5 w-3.5" /> SVG</button>
      </div>

      {sel && (
        <div className="flex flex-wrap items-center gap-3 border border-black/[0.08] bg-[var(--color-surface-1)] px-3 py-2">
          <input value={sel.text} onChange={(e) => setNodes((ns) => ns.map((n) => (n.id === sel.id ? { ...n, text: e.target.value } : n)))}
            className="flex-1 bg-transparent text-[14px] font-medium text-[var(--color-fg)] outline-none" placeholder="Box label" />
          <div className="flex gap-1.5">
            {COLORS.map((c, i) => (
              <button key={c} type="button" onClick={() => setNodes((ns) => ns.map((n) => (n.id === sel.id ? { ...n, color: i } : n)))}
                className={`h-6 w-6 rounded-full border-2 ${sel.color === i ? 'border-[var(--color-fg)]' : 'border-transparent'}`} style={{ background: c }} />
            ))}
          </div>
          <select value={sel.shape ?? 'rect'} onChange={(e) => setNodes((ns) => ns.map((n) => (n.id === sel.id ? { ...n, shape: e.target.value as Shape } : n)))}
            className="border border-black/[0.1] bg-transparent px-1.5 py-1 text-[12px]">
            {SHAPES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </div>
      )}

      <div className="overflow-hidden border border-black/[0.08] bg-white">
        <svg ref={svgRef} viewBox={`0 0 ${VW} ${VH}`} className="block w-full touch-none select-none" style={{ aspectRatio: `${VW}/${VH}` }}
          onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={onUp} onClick={() => { if (!linkMode) setSelected(null); }}>
          <defs><marker id="arrh" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto"><path d="M0,0 L8,3 L0,6 Z" fill="#475569" /></marker></defs>
          {edges.map((e, i) => { const a = nodes.find((n) => n.id === e.from), b = nodes.find((n) => n.id === e.to); if (!a || !b) return null; const pa = borderPoint(a, center(b)), pb = borderPoint(b, center(a)); return <line key={i} x1={pa.x} y1={pa.y} x2={pb.x} y2={pb.y} stroke="#94a3b8" strokeWidth={2} markerEnd="url(#arrh)" />; })}
          {nodes.map((n) => {
            const stroke = selected === n.id ? '#0a0a0a' : linkFrom === n.id ? '#f59e0b' : 'transparent';
            return (
              <g key={n.id} onPointerDown={(e) => onNodeDown(e, n)} className="cursor-move">
                <NodeShape n={n} stroke={stroke} />
                <text x={n.x + NW / 2} y={n.y + NH / 2} fill="#fff" fontSize={15} fontWeight={600} textAnchor="middle" dominantBaseline="central" className="pointer-events-none">{n.text}</text>
              </g>
            );
          })}
        </svg>
      </div>
      <p className="text-[11px] text-[var(--color-fg-subtle)]">Drag boxes to move. Click <strong>Connect</strong>, then a source and a target box to link them. Select a box to rename or recolour it.</p>
    </div>
  );
}
