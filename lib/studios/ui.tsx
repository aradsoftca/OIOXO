'use client';

import * as React from 'react';
import { cn } from '@/lib/cn';
import { StudioResponsive, MobilePanelHost, useResponsiveStudio } from './responsive';
import { ToastProvider } from './toast';
import { ShortcutsProvider, openShortcutsOverlay } from './shortcuts-overlay';

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
                'relative flex h-full min-h-0 w-full flex-col bg-[#0c0d10] text-zinc-200 overflow-hidden select-none',
                className,
              )}
            >
              {children}
              {/* Always-present "?" help affordance — opens the shortcuts/help
                  cheat-sheet. Critical on TOUCH devices where "?" can't be typed,
                  and a consistent discoverability anchor across all 9 studios.
                  Bottom-left so it clears right-docked inspectors / FABs. */}
              <StudioHelpFab />
              {/* The single mobile bottom-sheet host — renders whichever panel
                  the studio has open (one at a time, tab-switchable). */}
              <MobileSheetHost />
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
    // Mobile: TWO rows, not one. Cramming a scrollable tool strip AND the full
    // pinned right-cluster into one 44px row choked the tools into a ~100px
    // sliver (everything off-screen, undiscoverable). Instead:
    //   • Row 1 — the right cluster (undo/redo/panels/export), the actions a
    //     touch user reaches for most, at full 44px targets, never clipped.
    //   • Row 2 — the scrollable tool/menu strip gets the WHOLE width with a
    //     swipe-fade affordance, so New/Templates/AI tools/etc. are reachable.
    // This is the frontier-mobile pattern (Procreate/CapCut): primary actions
    // pinned, secondary tools in a full-width scroller.
    return (
      <div className="flex flex-col shrink-0 border-b border-white/5 bg-[#111317]">
        {right ? (
          <div className="flex h-12 items-center justify-end gap-1 px-2">{right}</div>
        ) : null}
        {left ? (
          <div className="relative min-w-0">
            <div className="flex items-center gap-1.5 overflow-x-auto px-2 pb-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">{left}</div>
            {/* Right-edge fade = "there's more, swipe" — without it the strip
                reads as complete and everything off-screen is undiscoverable. */}
            <div className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-[#111317] to-transparent" />
          </div>
        ) : null}
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

export function StudioSidebar({ side = 'right', width = 280, label, autoOpen = true, children }: { side?: 'left' | 'right'; width?: number; label?: string; autoOpen?: boolean; children: React.ReactNode }) {
  const { mode } = useResponsiveStudio();
  if (mode !== 'desktop') {
    return <MobileFloatingPanel side={side} label={label} autoOpen={autoOpen}>{children}</MobileFloatingPanel>;
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

// ── Mobile bottom-sheet coordinator ──────────────────────────────────────
// Studios mount SEVERAL <StudioSidebar>s at once (image 7, video 5, slides 6…).
// If each rendered its own bottom sheet they'd stack and overlap — unusable.
// So all sheets share ONE coordinator: at most one sheet is visible at a time,
// and a slim tab strip lets the user switch between the others that are mounted.
// The studio's own top-bar toggles still mount/unmount panels; this just decides
// which mounted one is on screen.
interface SheetEntry { id: number; node: React.ReactNode; label?: string; }
let _sheetSeq = 0;
const _sheetListeners = new Set<() => void>();
let _sheets: SheetEntry[] = [];
let _activeSheet = -1;
// Start COLLAPSED behind the pill. A sheet only auto-OPENS when its source panel
// opts in (`autoOpen`, default true) — that's the case for panels the studio
// mounts on a user TAP (Layers, Adjust). Always-present panels (PDF's page list)
// pass autoOpen={false} so they don't cover the document on launch.
let _sheetCollapsed = true;
function _emitSheets() { _sheetListeners.forEach(l => l()); }
function _registerSheet(node: React.ReactNode, label: string | undefined, autoOpen: boolean): number {
  const id = ++_sheetSeq;
  _sheets = [..._sheets, { id, node, label }];
  _activeSheet = id;
  if (autoOpen) _sheetCollapsed = false; // user opened this one → show it
  _emitSheets();
  return id;
}
function _updateSheet(id: number, node: React.ReactNode, label?: string) {
  _sheets = _sheets.map(s => s.id === id ? { id, node, label } : s); _emitSheets();
}
function _unregisterSheet(id: number) {
  _sheets = _sheets.filter(s => s.id !== id);
  if (_activeSheet === id) _activeSheet = _sheets.length ? _sheets[_sheets.length - 1].id : -1;
  _emitSheets();
}
function useSheetStore() {
  const [, force] = React.useReducer(x => x + 1, 0);
  React.useEffect(() => { _sheetListeners.add(force); return () => { _sheetListeners.delete(force); }; }, []);
  return { sheets: _sheets, active: _activeSheet, collapsed: _sheetCollapsed,
    setActive: (id: number) => { _activeSheet = id; _sheetCollapsed = false; _emitSheets(); },
    collapse: () => { _sheetCollapsed = true; _emitSheets(); },
    expand: () => { _sheetCollapsed = false; _emitSheets(); } };
}

/** Each mounted mobile sidebar just registers its content; the single host below
 *  renders the active one. Renders nothing itself. */
function MobileFloatingPanel({ children, label, autoOpen = true }: { side: 'left' | 'right'; label?: string; autoOpen?: boolean; children: React.ReactNode }) {
  const idRef = React.useRef<number>(0);
  // Register on mount, unregister on unmount.
  React.useEffect(() => {
    idRef.current = _registerSheet(children, label, autoOpen);
    return () => _unregisterSheet(idRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Keep content fresh on re-render (sliders move, layers change…).
  React.useEffect(() => { if (idRef.current) _updateSheet(idRef.current, children, label); });
  return null;
}

/** The ONE bottom sheet for the whole studio on mobile. Render once near the
 *  studio root (StudioShell does this). Shows the active panel with a tab strip
 *  to switch between any other open panels; collapses to a pill. */
/** Small floating "?" affordance, pinned bottom-left, that opens the shortcuts/
 *  help cheat-sheet. Present in every studio via StudioShell. Sits clear of the
 *  mobile bottom-sheet (which docks bottom-center/right) and respects the safe
 *  area. Hidden while a mobile sheet is expanded so it never overlaps it. */
function StudioHelpFab() {
  return (
    <button
      onClick={() => openShortcutsOverlay()}
      title="Shortcuts & help (?)"
      aria-label="Show shortcuts and help"
      className="absolute bottom-2 left-2 z-30 inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-[#15171c]/90 text-zinc-400 shadow-lg backdrop-blur transition hover:bg-white/10 hover:text-zinc-100"
      style={{ marginBottom: 'env(safe-area-inset-bottom)' }}
    >
      <span className="font-mono text-sm font-bold">?</span>
    </button>
  );
}

export function MobileSheetHost() {
  const { mode } = useResponsiveStudio();
  const { sheets, active, collapsed, setActive, collapse, expand } = useSheetStore();
  // After the app has settled, later-mounted panels (user taps) auto-open.
  if (mode === 'desktop' || sheets.length === 0) return null;
  const activeEntry = sheets.find(s => s.id === active) ?? sheets[sheets.length - 1];

  if (collapsed) {
    return (
      <button
        onClick={expand}
        aria-label="Show panels"
        className="fixed bottom-16 right-3 z-40 grid h-12 w-12 place-items-center rounded-full border border-white/10 bg-[#111317] text-zinc-200 shadow-xl"
      >
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M4 6h16M4 12h16M4 18h16" /></svg>
        {sheets.length > 1 && (
          <span className="absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full bg-cyan-500 text-[10px] font-bold text-zinc-900">{sheets.length}</span>
        )}
      </button>
    );
  }

  return (
    <>
      <div className="fixed inset-0 z-30 bg-black/40" onClick={collapse} aria-hidden />
      <div className="fixed inset-x-0 bottom-12 z-40 flex max-h-[72vh] flex-col rounded-t-2xl border-t border-white/10 bg-[#0f1115] shadow-2xl animate-in slide-in-from-bottom duration-200">
        <div className="flex shrink-0 items-center justify-center pt-2 pb-1"><div className="h-1 w-10 rounded-full bg-white/20" /></div>
        {/* Tab strip — only when more than one panel is open. */}
        {sheets.length > 1 && (
          <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-white/5 px-2 pb-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {sheets.map((s, i) => (
              <button
                key={s.id}
                onClick={() => setActive(s.id)}
                className={cn('h-8 shrink-0 rounded-md px-3 text-xs font-medium', s.id === active ? 'bg-cyan-500/15 text-cyan-200' : 'text-zinc-400 hover:bg-white/5')}
              >
                {s.label ?? i + 1}
              </button>
            ))}
            <button onClick={collapse} aria-label="Close" className="ml-auto grid h-8 w-8 shrink-0 place-items-center rounded-md text-zinc-400 hover:bg-white/5">
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M18 6 6 18M6 6l12 12" /></svg>
            </button>
          </div>
        )}
        {sheets.length === 1 && (
          <button onClick={collapse} aria-label="Close panel" className="absolute right-2 top-1 grid h-9 w-9 place-items-center rounded-lg text-zinc-400 hover:bg-white/5">
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {activeEntry?.node}
        </div>
      </div>
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
        // h-7/h-8 everywhere — below the 44px touch-target floor. `min-w-11`
        // (44px) guarantees icon-only buttons (undo/redo/panels) are a full
        // touch target wide, not a ~34px sliver, while text buttons grow past it.
        size === 'sm' ? 'h-11 min-w-11 px-2.5 text-xs sm:h-7 sm:min-w-0 sm:px-2' : 'h-11 min-w-11 px-3.5 text-sm sm:h-8 sm:min-w-0 sm:px-3',
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
