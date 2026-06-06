'use client';

import * as React from 'react';
import { useSearchParams } from 'next/navigation';
import { Pencil, Eraser, Trash2, Copy, Check, Users, Loader2, ShieldCheck, AlertTriangle, RotateCcw, Link2, Undo2, Redo2, Smile, Wifi, WifiOff } from 'lucide-react';
import { makeRoomCode } from '@/lib/p2p/peer';
import { useRoomCode } from '@/lib/p2p/use-room-code';
import { joinGroup, type Group, type GroupState } from '@/lib/p2p/group';

// A stroke segment is normalized 0..1 so every device renders it at its own size.
// `by` tags the author so undo can be per-user-sane (you undo YOUR strokes only,
// never a teammate's) — the #1 multiplayer-undo expectation in the rival bar.
interface Seg { x0: number; y0: number; x1: number; y1: number; color: string; size: number; erase: boolean; by: string; stamp: number }
const COLORS = ['#0a1633', '#e5484d', '#0090ff', '#30a46c', '#f5a623', '#8e4ec6', '#ffffff'];
const REACTIONS = ['👍', '❤️', '🎉', '🔥', '😂', '👀', '💯', '🤔'];

// Stable, friendly per-session identity. A whiteboard with anonymous dots is a
// "shared file"; name+color is what makes presence feel HUMAN (FigJam's moat).
const NAMES = ['Otter', 'Falcon', 'Maple', 'Coral', 'Ember', 'Willow', 'Juno', 'Pixel', 'Cobalt', 'Sage', 'Nova', 'Reef'];
const HUES = ['#e5484d', '#0090ff', '#30a46c', '#f5a623', '#8e4ec6', '#e93d82', '#0d9488', '#d97706'];

// Live cursor we render for each remote peer.
interface Cursor { x: number; y: number; name: string; hue: string; t: number; drawing: boolean }
// Reaction floating up from the board.
interface Floater { id: number; emoji: string; x: number; y: number }

export default function BoardApp() {
  const params = useSearchParams();
  const joinCode = params.get('r');
  const role: 's' | 'r' = joinCode ? 'r' : 's';
  const room = useRoomCode(joinCode); // client-only (avoids hydration mismatch)

  // One stable identity per session, persisted so a reconnect keeps your name.
  // Resolved on the CLIENT only — building it during render (random name/hue +
  // localStorage read) produced different markup on server vs client → a React
  // hydration mismatch (the dev "1 issue" overlay + a first-paint flash). The id
  // (peer identity, never rendered) can stay random in a ref.
  const idRefStable = React.useRef('');
  if (!idRefStable.current) idRefStable.current = makeRoomCode();
  const [me, setMe] = React.useState<{ id: string; name: string; hue: string }>(() => ({ id: idRefStable.current, name: '', hue: HUES[0] }));
  React.useEffect(() => {
    let name = NAMES[Math.floor(Math.random() * NAMES.length)];
    let hue = HUES[Math.floor(Math.random() * HUES.length)];
    try {
      const saved = JSON.parse(localStorage.getItem('xonvert-board-id') || 'null');
      if (saved && typeof saved.name === 'string') { name = saved.name; hue = saved.hue || hue; }
      else localStorage.setItem('xonvert-board-id', JSON.stringify({ name, hue }));
    } catch { /* private mode */ }
    setMe({ id: idRefStable.current, name, hue });
    setName((n) => n || name);
  }, []);

  const [state, setState] = React.useState<GroupState>('connecting');
  const [everConnected, setEverConnected] = React.useState(false);
  const [roster, setRoster] = React.useState(role === 's' ? 1 : 2);
  const [color, setColor] = React.useState(COLORS[0]);
  const [size, setSize] = React.useState(4);
  const [erase, setErase] = React.useState(false);
  const [qr, setQr] = React.useState('');
  const [copied, setCopied] = React.useState(false);
  const [name, setName] = React.useState(me.name);
  const [emotesOpen, setEmotesOpen] = React.useState(false);
  const [cursors, setCursors] = React.useState<Record<string, Cursor>>({});
  const [floaters, setFloaters] = React.useState<Floater[]>([]);
  const [hasInk, setHasInk] = React.useState(false); // drives the empty-board hint

  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const groupRef = React.useRef<Group | null>(null);
  const historyRef = React.useRef<Seg[]>([]);
  const redoRef = React.useRef<Seg[]>([]);
  const drawing = React.useRef(false);
  const last = React.useRef<{ x: number; y: number } | null>(null);
  const strokeStamp = React.useRef(0); // groups segments of one pen-down into one undo unit
  const toolRef = React.useRef({ color, size, erase });
  toolRef.current = { color, size, erase };
  const nameRef = React.useRef(name);
  nameRef.current = name;
  const lastMoveSent = React.useRef(0);
  const floaterId = React.useRef(0);

  const link = room && typeof window !== 'undefined' ? `${window.location.origin}/board?r=${room}` : '';

  const drawSeg = React.useCallback((s: Seg, store = true) => {
    // Cap total history (local + peer) — without this, a long session
    // OOMs the tab: every pointer move pushes a Seg, never freed.
    if (store) {
      if (historyRef.current.length >= 50_000) return;
      historyRef.current.push(s);
      if (historyRef.current.length === 1) setHasInk(true);
    }
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

  const num = (v: unknown, lo: number, hi: number) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : 0;
  };

  React.useEffect(() => {
    if (!room) return; // wait for the client-minted room code
    const group = joinGroup(room, role === 's', 'board', {
      onState: (s) => { setState(s); if (s === 'connected') setEverConnected(true); },
      onRoster: setRoster,
      onMessage: (data) => {
        if (data?.type === 'draw') {
          // Sanitize peer-supplied segment — without this a hostile peer
          // could blow up memory (size: 999999) or corrupt the canvas by
          // sending NaN coords, and history would grow unbounded.
          const s = data.seg;
          if (!s || typeof s !== 'object') return;
          const clean: Seg = {
            x0: num(s.x0, 0, 1), y0: num(s.y0, 0, 1),
            x1: num(s.x1, 0, 1), y1: num(s.y1, 0, 1),
            color: typeof s.color === 'string' ? s.color.slice(0, 32) : '#000',
            size: num(s.size, 1, 50),
            erase: !!s.erase,
            by: typeof s.by === 'string' ? s.by.slice(0, 24) : 'peer',
            stamp: num(s.stamp, 0, Number.MAX_SAFE_INTEGER),
          };
          drawSeg(clean, true); // drawSeg enforces the 50k history cap
        }
        else if (data?.type === 'clear') { historyRef.current = []; redoRef.current = []; setHasInk(false); redrawAll(); }
        else if (data?.type === 'undo' && typeof data.by === 'string' && typeof data.stamp === 'number') {
          // A peer undid their own stroke — drop only THAT author's matching
          // segments and repaint. Per-user undo: your move, your undo.
          const before = historyRef.current.length;
          historyRef.current = historyRef.current.filter((s) => !(s.by === data.by && s.stamp === data.stamp));
          if (historyRef.current.length !== before) { setHasInk(historyRef.current.length > 0); redrawAll(); }
        }
        else if (data?.type === 'cursor') {
          // Live remote cursor — name+color label so you always see WHO is
          // touching WHAT (the table-stake the old board was missing).
          const id = typeof data.id === 'string' ? data.id.slice(0, 24) : '';
          if (!id) return;
          setCursors((prev) => ({
            ...prev,
            [id]: {
              x: num(data.x, 0, 1), y: num(data.y, 0, 1),
              name: typeof data.name === 'string' ? data.name.slice(0, 18) : 'Guest',
              hue: typeof data.hue === 'string' ? data.hue.slice(0, 24) : '#0090ff',
              drawing: !!data.drawing,
              t: Date.now(),
            },
          }));
        }
        else if (data?.type === 'leave' && typeof data.id === 'string') {
          setCursors((prev) => { const n = { ...prev }; delete n[data.id]; return n; });
        }
        else if (data?.type === 'emote' && typeof data.emoji === 'string') {
          spawnFloater(data.emoji.slice(0, 8), num(data.x, 0, 1), num(data.y, 0, 1));
        }
      },
    });
    groupRef.current = group;
    return () => {
      // Tell peers our cursor is gone before we drop the channel.
      try { group.send({ type: 'leave', id: me.id }); } catch { /* */ }
      group.close();
    };
  // me.id is stable for the session; intentionally not a dep.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, room, drawSeg, redrawAll]);

  React.useEffect(() => {
    if (role !== 's' || !link) return;
    let alive = true;
    import('qrcode').then((m) => m.toDataURL(link, { margin: 1, width: 196 })).then((u) => alive && setQr(u)).catch(() => {});
    return () => { alive = false; };
  }, [role, link]);

  // Expire stale remote cursors (a peer that went silent for 6s) so ghosts
  // don't linger on the board after someone closes their tab without `leave`.
  React.useEffect(() => {
    const t = setInterval(() => {
      setCursors((prev) => {
        const now = Date.now();
        let changed = false;
        const next: Record<string, Cursor> = {};
        for (const [id, c] of Object.entries(prev)) {
          if (now - c.t < 6000) next[id] = c; else changed = true;
        }
        return changed ? next : prev;
      });
    }, 2000);
    return () => clearInterval(t);
  }, []);

  const spawnFloater = React.useCallback((emoji: string, x: number, y: number) => {
    const id = ++floaterId.current;
    setFloaters((f) => [...f.slice(-24), { id, emoji, x, y }]);
    window.setTimeout(() => setFloaters((f) => f.filter((x) => x.id !== id)), 2400);
  }, []);

  const pos = (e: React.PointerEvent) => {
    const c = canvasRef.current!; const r = c.getBoundingClientRect();
    // Guard against a 0-sized rect (parent collapsed during a CSS transition) —
    // dividing by 0 produces NaN, which corrupts history and the peer's canvas.
    if (r.width <= 0 || r.height <= 0) return { x: 0, y: 0 };
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
  };

  const sendCursor = (x: number, y: number, isDrawing: boolean) => {
    const now = Date.now();
    if (now - lastMoveSent.current < 40) return; // ~25/s — smooth but not flooding the channel
    lastMoveSent.current = now;
    groupRef.current?.send({ type: 'cursor', id: me.id, x, y, name: nameRef.current, hue: me.hue, drawing: isDrawing });
  };

  const down = (e: React.PointerEvent) => {
    drawing.current = true;
    redoRef.current = []; // a fresh stroke invalidates the redo stack
    strokeStamp.current = Date.now() + Math.random();
    last.current = pos(e);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    sendCursor(last.current.x, last.current.y, true);
  };
  const move = (e: React.PointerEvent) => {
    const p = pos(e);
    if (!drawing.current || !last.current) { sendCursor(p.x, p.y, false); return; }
    const t = toolRef.current;
    const seg: Seg = { x0: last.current.x, y0: last.current.y, x1: p.x, y1: p.y, color: t.color, size: t.size, erase: t.erase, by: me.id, stamp: strokeStamp.current };
    drawSeg(seg, true);
    groupRef.current?.send({ type: 'draw', seg });
    sendCursor(p.x, p.y, true);
    last.current = p;
  };
  const up = () => { drawing.current = false; last.current = null; };

  const undo = React.useCallback(() => {
    // Find the stamp of MY most-recent stroke and remove every segment of it.
    let stamp = 0;
    for (let i = historyRef.current.length - 1; i >= 0; i--) {
      if (historyRef.current[i].by === me.id) { stamp = historyRef.current[i].stamp; break; }
    }
    if (!stamp) return;
    const removed = historyRef.current.filter((s) => s.by === me.id && s.stamp === stamp);
    historyRef.current = historyRef.current.filter((s) => !(s.by === me.id && s.stamp === stamp));
    redoRef.current.push(...removed);
    setHasInk(historyRef.current.length > 0);
    redrawAll();
    groupRef.current?.send({ type: 'undo', by: me.id, stamp });
  }, [me.id, redrawAll]);

  const redo = React.useCallback(() => {
    if (redoRef.current.length === 0) return;
    // Re-add the last undone stroke (all its segments share one stamp).
    const stamp = redoRef.current[redoRef.current.length - 1].stamp;
    const back = redoRef.current.filter((s) => s.stamp === stamp);
    redoRef.current = redoRef.current.filter((s) => s.stamp !== stamp);
    for (const s of back) { historyRef.current.push(s); drawSeg(s, false); groupRef.current?.send({ type: 'draw', seg: s }); }
    setHasInk(historyRef.current.length > 0);
  }, [drawSeg]);

  const clearAll = () => { historyRef.current = []; redoRef.current = []; setHasInk(false); redrawAll(); groupRef.current?.send({ type: 'clear' }); };

  const sendEmote = (emoji: string) => {
    spawnFloater(emoji, 0.5, 0.85);
    groupRef.current?.send({ type: 'emote', emoji, x: 0.5, y: 0.85 });
    setEmotesOpen(false);
  };

  const copyLink = () => {
    navigator.clipboard?.writeText(link).catch(() => { /* permission denied */ });
    setCopied(true); setTimeout(() => setCopied(false), 1600);
  };

  // Single-key tool palette (Excalidraw signature: touch-typeable, no modifier)
  // plus per-user undo/redo. Skips when typing into the name field.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
      if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
      if (mod) return;
      const k = e.key.toLowerCase();
      if (k === 'p' || k === 'b') { setErase(false); }
      else if (k === 'e') { setErase(true); }
      else if (k === '[') { setSize((s) => Math.max(2, s - 2)); }
      else if (k === ']') { setSize((s) => Math.min(28, s + 2)); }
      else if (k >= '1' && k <= '7') { const i = Number(k) - 1; if (COLORS[i]) { setColor(COLORS[i]); setErase(false); } }
      else if (k === 'r') { setEmotesOpen((v) => !v); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo]);

  const saveName = (v: string) => {
    const clean = v.slice(0, 18);
    setName(clean);
    try { localStorage.setItem('xonvert-board-id', JSON.stringify({ name: clean, hue: me.hue })); } catch { /* */ }
  };

  const connected = state === 'connected';
  const reconnecting = !connected && everConnected; // we had a peer and lost them — reconcile, don't panic
  const liveCursors = Object.entries(cursors);

  return (
    // Grounded app window — kept light; the board reads as one contained app
    // on the page instead of bare elements in the cream margins.
    <div className="mx-auto max-w-6xl space-y-4 rounded-2xl border border-[var(--color-stroke)] bg-[var(--color-surface-2)] p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_8px_24px_-12px_rgba(0,0,0,0.12)]">
      <header className="flex flex-wrap items-center gap-3">
        <div className="grid h-11 w-11 place-items-center bg-[var(--color-cat-image)] text-white"><Pencil className="h-5 w-5" /></div>
        <div>
          <h1 className="text-[24px] font-extrabold tracking-tight">Whiteboard</h1>
          <p className="text-[13px] text-[var(--color-fg-muted)]">Draw together in real time. Peer-to-peer — nothing stored on a server.</p>
        </div>
        <div className="ml-auto flex items-center gap-3 text-[12px]">
          {/* You: editable identity that rides your cursor for everyone else. */}
          <span className="hidden items-center gap-1.5 sm:flex">
            <span className="h-2.5 w-2.5 rounded-full ring-2 ring-white" style={{ background: me.hue }} />
            <input value={name} onChange={(e) => saveName(e.target.value)} aria-label="Your name"
              className="w-20 bg-transparent text-[12px] font-semibold outline-none focus:underline" />
          </span>
          {connected ? (
            <span className="flex items-center gap-1.5 font-semibold"><Users className="h-3.5 w-3.5 text-green-600" /> {roster}</span>
          ) : reconnecting ? (
            <span className="flex items-center gap-1.5 text-amber-600"><WifiOff className="h-3.5 w-3.5" /> reconnecting</span>
          ) : state === 'failed' ? (
            <span className="flex items-center gap-1 text-amber-600"><AlertTriangle className="h-3.5 w-3.5" /> not connected</span>
          ) : (
            <span className="flex items-center gap-1.5 text-[var(--color-fg-muted)]"><Loader2 className="h-3 w-3 animate-spin" /> connecting</span>
          )}
          <Link2 className="hidden h-4 w-4 text-[var(--color-fg-subtle)] sm:block" />
        </div>
      </header>

      {/* Reconnecting: helpful, not a spinner of death. Your work stays put. */}
      {reconnecting && (
        <div className="flex items-center gap-2 border border-amber-500/30 bg-amber-50/40 px-4 py-2 text-[12.5px] text-[var(--color-fg-muted)]">
          <Wifi className="h-3.5 w-3.5 shrink-0 text-amber-600" />
          <span>Connection dropped — your board is safe and still editable. Reconnecting automatically…</span>
        </div>
      )}

      {state === 'failed' && !everConnected && (
        <div className="flex items-center justify-between gap-3 border border-amber-500/30 bg-amber-50/40 px-4 py-2.5 text-[12.5px] text-[var(--color-fg-muted)]">
          <span><AlertTriangle className="mr-1 inline h-3.5 w-3.5 text-amber-600" /> Couldn’t connect — a VPN/privacy extension may be blocking WebRTC. Try Incognito, another browser, or the same Wi-Fi.</span>
          <button type="button" onClick={() => window.location.reload()} className="flex shrink-0 items-center gap-1.5 bg-[var(--color-cat-image)] px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-white"><RotateCcw className="h-3.5 w-3.5" /> Retry</button>
        </div>
      )}

      {/* toolbar */}
      <div className="flex flex-wrap items-center gap-3 border border-black/[0.08] bg-[var(--color-surface-1)] p-2.5">
        <div className="flex items-center gap-1.5">
          {COLORS.map((c, i) => (
            <button key={c} type="button" onClick={() => { setColor(c); setErase(false); }} title={`Color ${i + 1}`}
              className={`h-6 w-6 rounded-full border-2 transition ${color === c && !erase ? 'border-[var(--color-fg)] scale-110' : 'border-black/20'}`}
              style={{ background: c }} />
          ))}
        </div>
        <div className="flex items-center gap-2">
          <input type="range" min={2} max={28} value={size} onChange={(e) => setSize(Number(e.target.value))} className="w-24 accent-[var(--color-cat-image)]" />
          <span className="font-mono text-[11px] text-[var(--color-fg-muted)]">{size}px</span>
        </div>
        <button type="button" onClick={() => setErase((v) => !v)} title="Eraser (E)"
          className={`flex items-center gap-1.5 border px-3 py-1.5 text-[12px] font-bold transition ${erase ? 'border-[var(--color-cat-image)] bg-[var(--color-cat-image)] text-white' : 'border-black/[0.08] text-[var(--color-fg-muted)]'}`}>
          <Eraser className="h-3.5 w-3.5" /> Eraser
        </button>

        {/* Per-user undo/redo — undoes YOUR stroke, never a teammate's. */}
        <div className="flex items-center gap-1">
          <button type="button" onClick={undo} title="Undo your last stroke (Ctrl+Z)"
            className="grid h-8 w-8 place-items-center border border-black/[0.08] text-[var(--color-fg-muted)] transition hover:bg-[var(--color-surface-2)] hover:text-[var(--color-fg)]"><Undo2 className="h-4 w-4" /></button>
          <button type="button" onClick={redo} title="Redo (Ctrl+Shift+Z)"
            className="grid h-8 w-8 place-items-center border border-black/[0.08] text-[var(--color-fg-muted)] transition hover:bg-[var(--color-surface-2)] hover:text-[var(--color-fg)]"><Redo2 className="h-4 w-4" /></button>
        </div>

        {/* Quick emote burst — temporal reactions, not litter (FigJam-style). */}
        <div className="relative">
          <button type="button" onClick={() => setEmotesOpen((v) => !v)} title="React (R)"
            className={`grid h-8 w-8 place-items-center border transition ${emotesOpen ? 'border-[var(--color-cat-image)] text-[var(--color-cat-image)]' : 'border-black/[0.08] text-[var(--color-fg-muted)] hover:bg-[var(--color-surface-2)]'}`}><Smile className="h-4 w-4" /></button>
          {emotesOpen && (
            <div className="absolute left-0 top-10 z-20 flex gap-0.5 border border-black/[0.1] bg-[var(--color-surface-1)] p-1.5 shadow-lg">
              {REACTIONS.map((e) => (
                <button key={e} type="button" onClick={() => sendEmote(e)} className="p-1 text-[20px] transition hover:scale-125">{e}</button>
              ))}
            </div>
          )}
        </div>

        <button type="button" onClick={clearAll} className="ml-auto flex items-center gap-1.5 border border-black/[0.08] px-3 py-1.5 text-[12px] text-[var(--color-fg-muted)] transition hover:bg-[var(--color-surface-2)] hover:text-[var(--color-fg)]"><Trash2 className="h-3.5 w-3.5" /> Clear</button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_260px]">
        <div className="relative aspect-[4/3] w-full overflow-hidden border border-black/[0.08] bg-white">
          <canvas ref={canvasRef} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up}
            className={`absolute inset-0 h-full w-full touch-none ${erase ? 'cursor-cell' : 'cursor-crosshair'}`} />

          {/* Live multiplayer cursors with name+color labels. */}
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            {liveCursors.map(([id, c]) => (
              <div key={id} className="absolute -translate-y-0 transition-[left,top] duration-100 ease-out"
                style={{ left: `${c.x * 100}%`, top: `${c.y * 100}%` }}>
                <svg viewBox="0 0 16 16" className="h-4 w-4 drop-shadow" style={{ fill: c.hue }}>
                  <path d="M1 1 L1 12 L4 9 L6.5 14 L8.5 13 L6 8 L10 8 Z" stroke="white" strokeWidth="1" />
                </svg>
                <span className="ml-3 inline-block whitespace-nowrap rounded-sm px-1.5 py-0.5 text-[10px] font-semibold text-white shadow"
                  style={{ background: c.hue }}>{c.name}{c.drawing ? ' ✏️' : ''}</span>
              </div>
            ))}

            {/* Floating reactions. */}
            {floaters.map((f) => (
              <span key={f.id} className="board-emote absolute text-[26px]" style={{ left: `${f.x * 100}%`, top: `${f.y * 100}%` }}>{f.emoji}</span>
            ))}
          </div>

          {/* First-run hint over an empty board — speed-to-first-shape clarity. */}
          {!hasInk && (
            <div className="pointer-events-none absolute inset-0 grid place-items-center">
              <span className="text-[13px] font-medium text-[var(--color-fg-subtle)]/70">{connected ? 'Start drawing — everyone here sees it instantly.' : 'Drawing works offline; it’ll sync when peers connect.'}</span>
            </div>
          )}

          <style jsx>{`
            @keyframes boardEmoteRise {
              0% { transform: translate(-50%, 0) scale(0.7); opacity: 0; }
              15% { opacity: 1; transform: translate(-50%, -8px) scale(1.1); }
              80% { opacity: 1; }
              100% { transform: translate(-50%, -120px) scale(0.9); opacity: 0; }
            }
            .board-emote { animation: boardEmoteRise 2.4s ease-out forwards; will-change: transform, opacity; }
          `}</style>
        </div>

        <aside className="space-y-3">
          <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-4">
            <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Invite to draw</div>
            {role === 's' && qr && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qr} alt="QR" className="mx-auto my-3 h-36 w-36 border border-black/[0.06] bg-white p-1" />
            )}
            <button type="button" onClick={copyLink} className="mt-2 flex w-full items-center justify-center gap-2 bg-[var(--color-cat-image)] py-2.5 text-[12px] font-bold uppercase tracking-wider text-white transition hover:brightness-110">
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} {copied ? 'Copied' : 'Copy link'}
            </button>
            <div className="mt-2 break-all rounded border border-black/[0.06] bg-black/[0.02] px-2 py-1.5 font-mono text-[10px] text-[var(--color-fg-muted)]">{link}</div>
          </div>

          {/* Who's here — live presence list, the "you see WHO" promise. */}
          <div className="border border-black/[0.06] bg-[var(--color-surface-1)] p-3">
            <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">In this board</div>
            <ul className="space-y-1.5 text-[12px]">
              <li className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: me.hue }} />
                <span className="font-semibold">{name || 'You'}</span>
                <span className="text-[10px] text-[var(--color-fg-subtle)]">you</span>
              </li>
              {liveCursors.map(([id, c]) => (
                <li key={id} className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: c.hue }} />
                  <span>{c.name}</span>
                  {c.drawing && <span className="text-[10px] text-green-600">drawing…</span>}
                </li>
              ))}
              {liveCursors.length === 0 && <li className="text-[11px] text-[var(--color-fg-subtle)]">Share the link to bring people in.</li>}
            </ul>
          </div>

          <div className="border border-black/[0.06] bg-[var(--color-surface-1)] p-3">
            <div className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Shortcuts</div>
            <ul className="space-y-1 text-[11px] text-[var(--color-fg-muted)]">
              <li><kbd className="font-mono">P</kbd> pen · <kbd className="font-mono">E</kbd> eraser · <kbd className="font-mono">1–7</kbd> colors</li>
              <li><kbd className="font-mono">[ ]</kbd> brush size · <kbd className="font-mono">R</kbd> react</li>
              <li><kbd className="font-mono">Ctrl+Z</kbd> undo your stroke · <kbd className="font-mono">⇧Z</kbd> redo</li>
            </ul>
          </div>

          <div className="flex items-start gap-2 border border-black/[0.06] bg-black/[0.015] p-3 text-[11px] leading-relaxed text-[var(--color-fg-subtle)]">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-green-600" />
            <span>Strokes travel directly between devices over an encrypted connection — never through our servers. New joiners see drawing from the moment they connect.</span>
          </div>
        </aside>
      </div>
    </div>
  );
}
