'use client';

import * as React from 'react';
import { useSearchParams } from 'next/navigation';
import { Pencil, Eraser, Trash2, Copy, Check, Users, Loader2, ShieldCheck, AlertTriangle, RotateCcw, Link2 } from 'lucide-react';
import { makeRoomCode } from '@/lib/p2p/peer';
import { joinGroup, type Group, type GroupState } from '@/lib/p2p/group';

interface Seg { x0: number; y0: number; x1: number; y1: number; color: string; size: number; erase: boolean } // normalized 0..1
const COLORS = ['#0a1633', '#e5484d', '#0090ff', '#30a46c', '#f5a623', '#8e4ec6', '#ffffff'];

export default function BoardApp() {
  const params = useSearchParams();
  const joinCode = params.get('r');
  const role: 's' | 'r' = joinCode ? 'r' : 's';
  const [room] = React.useState(() => joinCode || makeRoomCode());

  const [state, setState] = React.useState<GroupState>('connecting');
  const [roster, setRoster] = React.useState(role === 's' ? 1 : 2);
  const [color, setColor] = React.useState(COLORS[0]);
  const [size, setSize] = React.useState(4);
  const [erase, setErase] = React.useState(false);
  const [qr, setQr] = React.useState('');
  const [copied, setCopied] = React.useState(false);

  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const groupRef = React.useRef<Group | null>(null);
  const historyRef = React.useRef<Seg[]>([]);
  const drawing = React.useRef(false);
  const last = React.useRef<{ x: number; y: number } | null>(null);
  const toolRef = React.useRef({ color, size, erase });
  toolRef.current = { color, size, erase };

  const link = typeof window !== 'undefined' ? `${window.location.origin}/board?r=${room}` : '';

  const drawSeg = React.useCallback((s: Seg, store = true) => {
    if (store) historyRef.current.push(s);
    const c = canvasRef.current; if (!c) return;
    const ctx = c.getContext('2d'); if (!ctx) return;
    ctx.globalCompositeOperation = s.erase ? 'destination-out' : 'source-over';
    ctx.strokeStyle = s.color;
    ctx.lineWidth = s.size * (s.erase ? 3 : 1);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(s.x0 * c.width, s.y0 * c.height);
    ctx.lineTo(s.x1 * c.width, s.y1 * c.height);
    ctx.stroke();
  }, []);

  const redrawAll = React.useCallback(() => {
    const c = canvasRef.current; if (!c) return;
    const ctx = c.getContext('2d'); if (!ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);
    for (const s of historyRef.current) drawSeg(s, false);
  }, [drawSeg]);

  // Size the canvas to its container (and keep the drawing on resize).
  React.useEffect(() => {
    const c = canvasRef.current; if (!c) return;
    const fit = () => {
      const r = c.getBoundingClientRect();
      c.width = Math.round(r.width); c.height = Math.round(r.height);
      redrawAll();
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(c);
    return () => ro.disconnect();
  }, [redrawAll]);

  React.useEffect(() => {
    const group = joinGroup(room, role === 's', 'board', {
      onState: setState,
      onRoster: setRoster,
      onMessage: (data) => {
        if (data?.type === 'draw') drawSeg(data.seg, true);
        else if (data?.type === 'clear') { historyRef.current = []; redrawAll(); }
      },
    });
    groupRef.current = group;
    return () => group.close();
  }, [role, room, drawSeg, redrawAll]);

  React.useEffect(() => {
    if (role !== 's' || !link) return;
    let alive = true;
    import('qrcode').then((m) => m.toDataURL(link, { margin: 1, width: 196 })).then((u) => alive && setQr(u)).catch(() => {});
    return () => { alive = false; };
  }, [role, link]);

  const pos = (e: React.PointerEvent) => {
    const c = canvasRef.current!; const r = c.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
  };
  const down = (e: React.PointerEvent) => { drawing.current = true; last.current = pos(e); (e.target as HTMLElement).setPointerCapture(e.pointerId); };
  const move = (e: React.PointerEvent) => {
    if (!drawing.current || !last.current) return;
    const p = pos(e);
    const t = toolRef.current;
    const seg: Seg = { x0: last.current.x, y0: last.current.y, x1: p.x, y1: p.y, color: t.color, size: t.size, erase: t.erase };
    drawSeg(seg, true);
    groupRef.current?.send({ type: 'draw', seg });
    last.current = p;
  };
  const up = () => { drawing.current = false; last.current = null; };

  const clearAll = () => { historyRef.current = []; redrawAll(); groupRef.current?.send({ type: 'clear' }); };
  const copyLink = () => { void navigator.clipboard?.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1600); };

  const connected = state === 'connected';

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <header className="flex flex-wrap items-center gap-3">
        <div className="grid h-11 w-11 place-items-center bg-[var(--color-cat-image)] text-white"><Pencil className="h-5 w-5" /></div>
        <div>
          <h1 className="text-[24px] font-extrabold tracking-tight">Whiteboard</h1>
          <p className="text-[13px] text-[var(--color-fg-muted)]">Draw together in real time. Peer-to-peer — nothing stored on a server.</p>
        </div>
        <div className="ml-auto flex items-center gap-2 text-[12px]">
          {connected ? <span className="flex items-center gap-1.5 font-semibold"><Users className="h-3.5 w-3.5 text-green-600" /> {roster}</span>
            : state === 'failed' ? <span className="flex items-center gap-1 text-amber-600"><AlertTriangle className="h-3.5 w-3.5" /> not connected</span>
            : <span className="flex items-center gap-1.5 text-[var(--color-fg-muted)]"><Loader2 className="h-3 w-3 animate-spin" /> connecting</span>}
          <Link2 className="hidden h-4 w-4 text-[var(--color-fg-subtle)] sm:block" />
        </div>
      </header>

      {state === 'failed' && (
        <div className="flex items-center justify-between gap-3 border border-amber-500/30 bg-amber-50/40 px-4 py-2.5 text-[12.5px] text-[var(--color-fg-muted)]">
          <span><AlertTriangle className="mr-1 inline h-3.5 w-3.5 text-amber-600" /> Couldn’t connect — a VPN/privacy extension may be blocking WebRTC. Try Incognito, another browser, or the same Wi-Fi.</span>
          <button type="button" onClick={() => window.location.reload()} className="flex shrink-0 items-center gap-1.5 bg-[var(--color-cat-image)] px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-white"><RotateCcw className="h-3.5 w-3.5" /> Retry</button>
        </div>
      )}

      {/* toolbar */}
      <div className="flex flex-wrap items-center gap-3 border border-black/[0.08] bg-[var(--color-surface-1)] p-2.5">
        <div className="flex items-center gap-1.5">
          {COLORS.map((c) => (
            <button key={c} type="button" onClick={() => { setColor(c); setErase(false); }}
              className={`h-6 w-6 rounded-full border-2 transition ${color === c && !erase ? 'border-[var(--color-fg)] scale-110' : 'border-black/20'}`}
              style={{ background: c }} />
          ))}
        </div>
        <div className="flex items-center gap-2">
          <input type="range" min={2} max={28} value={size} onChange={(e) => setSize(Number(e.target.value))} className="w-24 accent-[var(--color-cat-image)]" />
          <span className="font-mono text-[11px] text-[var(--color-fg-muted)]">{size}px</span>
        </div>
        <button type="button" onClick={() => setErase((v) => !v)}
          className={`flex items-center gap-1.5 border px-3 py-1.5 text-[12px] font-bold transition ${erase ? 'border-[var(--color-cat-image)] bg-[var(--color-cat-image)] text-white' : 'border-black/[0.08] text-[var(--color-fg-muted)]'}`}>
          <Eraser className="h-3.5 w-3.5" /> Eraser
        </button>
        <button type="button" onClick={clearAll} className="ml-auto flex items-center gap-1.5 border border-black/[0.08] px-3 py-1.5 text-[12px] text-[var(--color-fg-muted)] transition hover:bg-[var(--color-surface-2)] hover:text-[var(--color-fg)]"><Trash2 className="h-3.5 w-3.5" /> Clear</button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_260px]">
        <div className="relative aspect-[4/3] w-full overflow-hidden border border-black/[0.08] bg-white">
          <canvas ref={canvasRef} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up} className="absolute inset-0 h-full w-full touch-none" />
        </div>

        <aside className="space-y-3">
          {role === 's' && (
            <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4">
              <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Invite to draw</div>
              {qr && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={qr} alt="QR" className="mx-auto my-3 h-36 w-36 border border-black/[0.06] bg-white p-1" />
              )}
              <button type="button" onClick={copyLink} className="flex w-full items-center justify-center gap-2 bg-[var(--color-cat-image)] py-2.5 text-[12px] font-bold uppercase tracking-wider text-white transition hover:brightness-110">
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} {copied ? 'Copied' : 'Copy link'}
              </button>
              <div className="mt-2 break-all rounded border border-black/[0.06] bg-black/[0.02] px-2 py-1.5 font-mono text-[10px] text-[var(--color-fg-muted)]">{link}</div>
            </div>
          )}
          <div className="flex items-start gap-2 border border-black/[0.06] bg-black/[0.015] p-3 text-[11px] leading-relaxed text-[var(--color-fg-subtle)]">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-green-600" />
            <span>Strokes travel directly between devices over an encrypted connection — never through our servers. New joiners see drawing from the moment they connect.</span>
          </div>
        </aside>
      </div>
    </div>
  );
}
