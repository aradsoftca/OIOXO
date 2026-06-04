'use client';

import * as React from 'react';
import { cn } from '@/lib/cn';

export type StudioMode = 'desktop' | 'tablet' | 'phone';

interface ResponsiveCtx {
  mode: StudioMode;
  panelOpen: string | null;
  setPanelOpen: (id: string | null) => void;
}

const Ctx = React.createContext<ResponsiveCtx | null>(null);

export function useResponsiveStudio(): ResponsiveCtx {
  const c = React.useContext(Ctx);
  if (!c) throw new Error('useResponsiveStudio must be used inside <StudioResponsive>');
  return c;
}

export function StudioResponsive({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = React.useState<StudioMode>('desktop');
  const [panelOpen, setPanelOpen] = React.useState<string | null>(null);

  React.useEffect(() => {
    const recompute = () => {
      const w = window.innerWidth;
      if (w < 640) setMode('phone');
      else if (w < 1024) setMode('tablet');
      else setMode('desktop');
    };
    recompute();
    window.addEventListener('resize', recompute);
    return () => window.removeEventListener('resize', recompute);
  }, []);

  const value = React.useMemo(() => ({ mode, panelOpen, setPanelOpen }), [mode, panelOpen]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

interface PanelDef { id: string; label: string; icon: React.ReactNode; content: React.ReactNode }

const PanelRegCtx = React.createContext<{ register: (p: PanelDef) => void; unregister: (id: string) => void } | null>(null);

export function MobilePanelHost({ children }: { children: React.ReactNode }) {
  const [panels, setPanels] = React.useState<PanelDef[]>([]);
  const reg = React.useMemo(() => ({
    register: (p: PanelDef) => setPanels(curr => {
      if (curr.find(x => x.id === p.id)) return curr.map(x => x.id === p.id ? p : x);
      return [...curr, p];
    }),
    unregister: (id: string) => setPanels(curr => curr.filter(x => x.id !== id)),
  }), []);
  const { mode, panelOpen, setPanelOpen } = useResponsiveStudio();
  const active = panels.find(p => p.id === panelOpen);

  if (mode === 'desktop') {
    return <PanelRegCtx.Provider value={reg}>{children}</PanelRegCtx.Provider>;
  }

  return (
    <PanelRegCtx.Provider value={reg}>
      {children}
      {active && (
        <div className="fixed inset-x-0 bottom-12 top-14 z-40 overflow-y-auto bg-[#0f1115] border-t border-white/10 animate-in slide-in-from-bottom duration-200">
          <div className="sticky top-0 z-10 flex h-10 items-center justify-between border-b border-white/5 bg-[#0f1115] px-3">
            <span className="text-sm font-semibold text-zinc-200">{active.label}</span>
            <button onClick={() => setPanelOpen(null)} className="rounded p-2 text-zinc-400 hover:bg-white/5">
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M18 6 6 18M6 6l12 12" /></svg>
            </button>
          </div>
          <div className="pb-24">{active.content}</div>
        </div>
      )}
      {panels.length > 0 && (
        <div
          className="fixed inset-x-0 z-30 flex items-stretch border-t border-white/10 bg-[#0a0b0e]"
          style={{
            bottom: 0,
            height: 'calc(3rem + env(safe-area-inset-bottom, 0px))',
            paddingBottom: 'env(safe-area-inset-bottom, 0px)',
          }}
        >
          {panels.map(p => (
            <button
              key={p.id}
              onClick={() => setPanelOpen(panelOpen === p.id ? null : p.id)}
              className={cn(
                'flex flex-1 flex-col items-center justify-center gap-0.5 text-[10px]',
                panelOpen === p.id ? 'text-cyan-300' : 'text-zinc-400 hover:text-zinc-200',
              )}
              style={{ minHeight: 44 }}
            >
              {p.icon}
              <span>{p.label}</span>
            </button>
          ))}
        </div>
      )}
    </PanelRegCtx.Provider>
  );
}

export function useMobilePanel(p: PanelDef) {
  const reg = React.useContext(PanelRegCtx);
  React.useEffect(() => {
    if (!reg) return;
    reg.register(p);
    return () => reg.unregister(p.id);
  }, [p.id, p.label, p.content, reg]);
}

export function usePinchPan(opts: {
  ref: React.RefObject<HTMLElement | null>;
  zoom: number;
  pan: { x: number; y: number };
  setZoom: (z: number) => void;
  setPan: (p: { x: number; y: number }) => void;
  minZoom?: number;
  maxZoom?: number;
}) {
  const { ref, zoom, pan, setZoom, setPan } = opts;
  const minZoom = opts.minZoom ?? 0.05;
  const maxZoom = opts.maxZoom ?? 16;
  const state = React.useRef<{
    touches: Map<number, { x: number; y: number }>;
    initialDistance: number;
    initialZoom: number;
    initialPan: { x: number; y: number };
    initialMidX: number;
    initialMidY: number;
  }>({ touches: new Map(), initialDistance: 0, initialZoom: 1, initialPan: { x: 0, y: 0 }, initialMidX: 0, initialMidY: 0 });

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length < 2) return;
      e.preventDefault();
      const t0 = e.touches[0], t1 = e.touches[1];
      const rect = el.getBoundingClientRect();
      const mx = (t0.clientX + t1.clientX) / 2 - rect.left;
      const my = (t0.clientY + t1.clientY) / 2 - rect.top;
      state.current = {
        touches: new Map([[t0.identifier, { x: t0.clientX, y: t0.clientY }], [t1.identifier, { x: t1.clientX, y: t1.clientY }]]),
        initialDistance: Math.hypot(t0.clientX - t1.clientX, t0.clientY - t1.clientY),
        initialZoom: zoom,
        initialPan: { ...pan },
        initialMidX: mx,
        initialMidY: my,
      };
    };
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length < 2 || state.current.touches.size < 2) return;
      e.preventDefault();
      const t0 = e.touches[0], t1 = e.touches[1];
      const rect = el.getBoundingClientRect();
      const mx = (t0.clientX + t1.clientX) / 2 - rect.left;
      const my = (t0.clientY + t1.clientY) / 2 - rect.top;
      const d = Math.hypot(t0.clientX - t1.clientX, t0.clientY - t1.clientY);
      const newZoom = Math.max(minZoom, Math.min(maxZoom, state.current.initialZoom * (d / state.current.initialDistance)));
      const k = newZoom / state.current.initialZoom;
      const dx = mx - state.current.initialMidX;
      const dy = my - state.current.initialMidY;
      setZoom(newZoom);
      setPan({
        x: state.current.initialMidX - (state.current.initialMidX - state.current.initialPan.x) * k + dx,
        y: state.current.initialMidY - (state.current.initialMidY - state.current.initialPan.y) * k + dy,
      });
    };
    const onTouchEnd = () => { state.current.touches.clear(); };
    el.addEventListener('touchstart', onTouchStart, { passive: false });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd);
    el.addEventListener('touchcancel', onTouchEnd);
    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [ref, zoom, pan, minZoom, maxZoom, setZoom, setPan]);
}

export function MobileTopBar({ title, action, onMenu }: { title: string; action?: React.ReactNode; onMenu?: () => void }) {
  const { mode } = useResponsiveStudio();
  if (mode === 'desktop') return null;
  return (
    <div className="flex h-12 shrink-0 items-center gap-2 border-b border-white/5 bg-[#111317] px-2">
      {onMenu && (
        <button onClick={onMenu} className="grid h-10 w-10 place-items-center rounded text-zinc-300 hover:bg-white/5">
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M4 6h16M4 12h16M4 18h16" /></svg>
        </button>
      )}
      <span className="flex-1 truncate text-sm font-semibold text-zinc-100">{title}</span>
      {action}
    </div>
  );
}

export function ResponsiveSidebar({
  id, label, icon, width = 280, side = 'right', children, hideOnMobile = false,
}: {
  id: string; label: string; icon: React.ReactNode; width?: number; side?: 'left' | 'right';
  children: React.ReactNode; hideOnMobile?: boolean;
}) {
  const { mode } = useResponsiveStudio();
  useMobilePanel({ id, label, icon, content: <div className="p-2">{children}</div> });
  if (mode !== 'desktop') return null;
  return (
    <div
      style={{ width }}
      className={cn('shrink-0 overflow-y-auto bg-[#0f1115] text-sm', side === 'right' ? 'border-l border-white/5' : 'border-r border-white/5')}
    >
      {children}
    </div>
  );
}

export function isPhone(): boolean {
  if (typeof window === 'undefined') return false;
  return window.innerWidth < 640;
}
