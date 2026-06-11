'use client';

import * as React from 'react';
import { cn } from '@/lib/cn';
import { StudioResponsive, MobilePanelHost, useResponsiveStudio } from './responsive';
import { ToastProvider } from './toast';
import { ShortcutsProvider } from './shortcuts-overlay';

// M4: grabbable slider thumbs. Native range thumbs are ~6-10px; on touch they
// need ~22-28px. Injected once per shell so every StudioSlider benefits.
const STUDIO_SHELL_CSS = `
.studio-range::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:18px;height:18px;border-radius:9999px;background:#fff;border:2px solid #22d3ee;cursor:pointer;box-shadow:0 1px 3px rgba(0,0,0,.4)}
.studio-range::-moz-range-thumb{width:18px;height:18px;border-radius:9999px;background:#fff;border:2px solid #22d3ee;cursor:pointer}
@media (pointer:coarse){
.studio-range::-webkit-slider-thumb{width:26px;height:26px}
.studio-range::-moz-range-thumb{width:26px;height:26px}
}
`;

export function StudioShell({ children, className }: { children: React.ReactNode; className?: string }) {
  // The studio is mounted inside <StudioFrame> (app/tools/[slug]/page.tsx),
  // which already gives us a full-viewport flex-height context: a slim top bar
  // plus a `flex-1` editor area sized to `calc(100dvh - header)`. So the shell
  // simply FILLS that parent (h-full + min-h-0 so inner flex/scroll children
  // size correctly) — no document-offset measuring, no blank-box collapse.
  // The mobile slide-out panels anchor to the top of this area via the
  // --studio-top-offset custom prop (the shell's own viewport top).
  const hostRef = React.useRef<HTMLDivElement>(null);
  const [topOffset, setTopOffset] = React.useState(0);

  React.useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const measure = () => setTopOffset(Math.max(0, Math.round(el.getBoundingClientRect().top)));
    measure();
    window.addEventListener('resize', measure);
    const t = window.setTimeout(measure, 300);
    return () => {
      window.removeEventListener('resize', measure);
      window.clearTimeout(t);
    };
  }, []);

  return (
    <StudioResponsive>
      <style>{STUDIO_SHELL_CSS}</style>
      <ToastProvider>
        <ShortcutsProvider>
          <MobilePanelHost>
            <div
              ref={hostRef}
              data-studio-shell
              style={{ ['--studio-top-offset' as string]: `${topOffset}px` }}
              className={cn(
                'flex h-full min-h-0 w-full flex-col bg-[#0c0d10] text-zinc-200 overflow-hidden select-none',
                className,
              )}
            >
              {children}
            </div>
          </MobilePanelHost>
        </ShortcutsProvider>
      </ToastProvider>
    </StudioResponsive>
  );
}

export function StudioTopBar({ title, left, right }: { title: React.ReactNode; left?: React.ReactNode; right?: React.ReactNode }) {
  const { mode } = useResponsiveStudio();
  if (mode !== 'desktop') {
    // Mobile: the StudioFrame slim bar already shows the tool name, so we DROP
    // the redundant inner title (it was eating a whole row and "… Pro" read as
    // nagware — same reasoning as desktop). The scrollable tool row and the
    // fixed right-controls share ONE row: tools scroll under the finger, the
    // right cluster (undo/redo/scopes/help) stays pinned and never clips.
    return (
      <div className="flex h-11 shrink-0 items-center gap-1 border-b border-white/5 bg-[#111317] px-2">
        {left ? (
          <div className="relative min-w-0 flex-1">
            <div className="flex items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">{left}</div>
            {/* Right-edge fade = "there's more, swipe" — without it the strip
                reads as complete and everything off-screen is undiscoverable. */}
            <div className="pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-[#111317] to-transparent" />
          </div>
        ) : <div className="flex-1" />}
        <div className="flex shrink-0 items-center gap-1 border-l border-white/10 pl-1">{right}</div>
      </div>
    );
  }
  // Desktop: the StudioFrame slim bar already shows the tool's name, so we DROP
  // the redundant inner title here. It was getting squeezed/clipped by the wide
  // toolbar (and "… Studio Pro" read as nagware). Giving the whole bar to the
  // actual controls is cleaner and matches how real editors lay out their menu
  // bar — tools, not a repeated product name.
  return (
    <div className="flex h-11 shrink-0 items-center gap-2 border-b border-white/5 bg-[#111317] px-3">
      {left ? <div className="flex items-center gap-1">{left}</div> : null}
      <div className="ml-auto flex items-center gap-1">{right}</div>
    </div>
  );
}

/** Render children only on the desktop layout (inside <StudioResponsive>). */
export function DesktopOnly({ children }: { children: React.ReactNode }) {
  const { mode } = useResponsiveStudio();
  return mode === 'desktop' ? <>{children}</> : null;
}

/** Render children only on the mobile/tablet layout (inside <StudioResponsive>). */
export function MobileOnly({ children }: { children: React.ReactNode }) {
  const { mode } = useResponsiveStudio();
  return mode !== 'desktop' ? <>{children}</> : null;
}

export function StudioBody({ children }: { children: React.ReactNode }) {
  const { mode } = useResponsiveStudio();
  // Mobile must stack: StudioToolDock renders as a horizontal strip there, and
  // in a row layout its intrinsic width (shrink-0 buttons) shoved the flex-1
  // canvas area completely off-screen (width 0 at x≈900 on a 390px phone).
  return (
    <div className={cn('flex flex-1 min-h-0', mode !== 'desktop' && 'flex-col pb-12')}>
      {children}
    </div>
  );
}

export function StudioToolDock({ children }: { children: React.ReactNode }) {
  const { mode } = useResponsiveStudio();
  if (mode !== 'desktop') {
    return (
      <div className="flex h-12 shrink-0 items-center gap-1 overflow-x-auto border-b border-white/5 bg-[#111317] px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {children}
      </div>
    );
  }
  return (
    <div className="flex w-12 shrink-0 flex-col items-center gap-1 border-r border-white/5 bg-[#111317] py-2">
      {children}
    </div>
  );
}

export function StudioToolButton({
  active, label, hint, onClick, children, disabled,
}: { active?: boolean; label: string; hint?: string; onClick?: () => void; children: React.ReactNode; disabled?: boolean }) {
  const { mode } = useResponsiveStudio();
  const size = mode === 'desktop' ? 'h-9 w-9' : 'h-11 w-11 shrink-0';
  return (
    <button
      onClick={onClick}
      title={hint ? `${label} (${hint})` : label}
      aria-label={label}
      disabled={disabled}
      className={cn(
        'flex items-center justify-center rounded-md border text-zinc-300 transition-all',
        size,
        active ? 'border-cyan-400/40 bg-cyan-400/10 text-cyan-200 shadow-[0_0_0_1px_rgba(34,211,238,.25)_inset]'
               : 'border-transparent hover:bg-white/5 hover:text-zinc-100 active:bg-white/10',
        disabled && 'opacity-40 cursor-not-allowed',
      )}
    >
      {children}
    </button>
  );
}

export function StudioPanel({ title, children, action, defaultOpen = true, className }: {
  title: string; children: React.ReactNode; action?: React.ReactNode; defaultOpen?: boolean; className?: string;
}) {
  const [open, setOpen] = React.useState(defaultOpen);
  return (
    <div className={cn('border-b border-white/5', className)}>
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-400 hover:bg-white/[.02]"
      >
        <span className="flex items-center gap-1.5">
          <svg className={cn('h-3 w-3 transition-transform', open && 'rotate-90')} viewBox="0 0 12 12" fill="currentColor"><path d="M4 2l4 4-4 4z" /></svg>
          {title}
        </span>
        {action ? <span onClick={e => e.stopPropagation()}>{action}</span> : null}
      </button>
      {open ? <div className="px-3 pb-3">{children}</div> : null}
    </div>
  );
}

export function StudioSidebar({ side = 'right', width = 280, children }: { side?: 'left' | 'right'; width?: number; children: React.ReactNode }) {
  const { mode } = useResponsiveStudio();
  if (mode !== 'desktop') {
    return <MobileFloatingPanel side={side}>{children}</MobileFloatingPanel>;
  }
  return (
    <div
      style={{ width }}
      className={cn(
        'shrink-0 overflow-y-auto bg-[#0f1115] text-sm',
        side === 'right' ? 'border-l border-white/5' : 'border-r border-white/5',
      )}
    >
      {children}
    </div>
  );
}

const SidebarCountCtx = React.createContext<{ register: () => number; unregister: (i: number) => void } | null>(null);

function MobileFloatingPanel({ side, children }: { side: 'left' | 'right'; children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const labelChar = side === 'left' ? '◀' : '▶';
  return (
    <>
      <button
        onClick={() => setOpen(o => !o)}
        className={cn(
          'fixed z-30 grid h-10 w-7 place-items-center rounded-md border border-white/10 bg-[#111317] text-xs text-zinc-300 shadow-lg',
          side === 'right' ? (open ? 'right-[260px] top-1/2 -translate-y-1/2' : 'right-1 top-1/2 -translate-y-1/2') : (open ? 'left-[260px] top-1/2 -translate-y-1/2' : 'left-1 top-1/2 -translate-y-1/2'),
        )}
        aria-label="Toggle panel"
      >
        {open ? (side === 'right' ? '▶' : '◀') : labelChar}
      </button>
      {open && (
        <div
          className={cn(
            'fixed top-[var(--studio-top-offset,108px)] bottom-[60px] z-20 w-[260px] overflow-y-auto bg-[#0f1115] shadow-2xl',
            side === 'right' ? 'right-0 border-l border-white/10' : 'left-0 border-r border-white/10',
          )}
        >
          {children}
        </div>
      )}
    </>
  );
}

export function StudioCanvasArea({ children, onWheel, className }: { children: React.ReactNode; onWheel?: React.WheelEventHandler; className?: string }) {
  return (
    <div onWheel={onWheel} className={cn('relative flex-1 overflow-hidden bg-[#0a0b0e]', className)}>
      <div className="absolute inset-0 bg-[radial-gradient(rgba(255,255,255,0.04)_1px,transparent_1px)] [background-size:18px_18px]" />
      {children}
    </div>
  );
}

export function StudioStatusBar({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-7 shrink-0 items-center gap-3 border-t border-white/5 bg-[#0f1115] px-3 text-[11px] text-zinc-400">
      {children}
    </div>
  );
}

export function StudioButton({
  variant = 'ghost', size = 'md', onClick, children, disabled, title, className,
}: {
  variant?: 'ghost' | 'primary' | 'danger' | 'soft';
  size?: 'sm' | 'md';
  onClick?: () => void;
  children: React.ReactNode;
  disabled?: boolean;
  title?: string;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        'inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-colors',
        // M4 (mobile): finger-sized on phones, compact on >=sm. Was a flat
        // h-7/h-8 everywhere — below the 44px touch-target floor.
        size === 'sm' ? 'h-9 px-2.5 text-xs sm:h-7 sm:px-2' : 'h-10 px-3.5 text-sm sm:h-8 sm:px-3',
        variant === 'ghost'   && 'text-zinc-300 hover:bg-white/5 hover:text-white',
        variant === 'primary' && 'bg-cyan-500 text-zinc-900 hover:bg-cyan-400',
        variant === 'danger'  && 'text-rose-300 hover:bg-rose-500/10',
        variant === 'soft'    && 'bg-white/5 text-zinc-200 hover:bg-white/10',
        disabled && 'opacity-40 cursor-not-allowed',
        className,
      )}
    >
      {children}
    </button>
  );
}

export function StudioNumberField({
  label, value, min, max, step = 1, onChange, suffix,
}: { label?: string; value: number; min?: number; max?: number; step?: number; onChange: (n: number) => void; suffix?: string }) {
  return (
    <label className="flex items-center justify-between gap-2 text-xs text-zinc-400">
      {label ? <span className="shrink-0">{label}</span> : null}
      <span className="flex items-center gap-1">
        <input
          type="number"
          value={Number.isFinite(value) ? value : 0}
          min={min} max={max} step={step}
          onChange={e => onChange(parseFloat(e.target.value || '0'))}
          className="w-16 rounded border border-white/10 bg-[#0a0b0e] px-1.5 py-1 text-right text-xs text-zinc-100 outline-none focus:border-cyan-400/50"
        />
        {suffix ? <span className="text-zinc-500">{suffix}</span> : null}
      </span>
    </label>
  );
}

export function StudioSlider({
  label, value, min, max, step = 1, onChange, suffix, color = '#22d3ee',
}: { label?: string; value: number; min: number; max: number; step?: number; onChange: (n: number) => void; suffix?: string; color?: string }) {
  return (
    <div className="space-y-1">
      {label ? (
        <div className="flex items-center justify-between text-xs text-zinc-400">
          <span>{label}</span>
          <span className="tabular-nums text-zinc-300">{Math.round(value)}{suffix}</span>
        </div>
      ) : null}
      <input
        type="range" value={value} min={min} max={max} step={step}
        onChange={e => onChange(parseFloat(e.target.value))}
        // M4: taller track on phones so the thumb is grabbable (was h-1.5 = ~6px,
        // ungrabbable). M5: touch-action:none so dragging doesn't scroll the page.
        className="studio-range h-2.5 sm:h-1.5 w-full appearance-none rounded-full bg-white/10 outline-none [touch-action:none]"
        style={{
          background: `linear-gradient(to right, ${color} 0%, ${color} ${((value - min) / (max - min)) * 100}%, rgba(255,255,255,.1) ${((value - min) / (max - min)) * 100}%, rgba(255,255,255,.1) 100%)`,
        }}
      />
    </div>
  );
}

export function StudioDivider() {
  return <div className="my-1 h-px w-7 bg-white/10" />;
}

export function StudioSelect<T extends string>({ value, options, onChange, className }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; className?: string }) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value as T)}
      className={cn('h-7 rounded border border-white/10 bg-[#0a0b0e] px-2 text-xs text-zinc-100 outline-none focus:border-cyan-400/50', className)}
    >
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}
