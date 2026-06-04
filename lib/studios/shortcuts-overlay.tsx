'use client';

import * as React from 'react';
import { cn } from '@/lib/cn';
import { formatCombo } from './shortcuts';

export interface ShortcutGroup {
  label: string;
  items: { combo: string; description: string }[];
}

interface ShortcutsContextValue {
  groups: ShortcutGroup[];
  setGroups: (groups: ShortcutGroup[]) => void;
  open: boolean;
  setOpen: (o: boolean) => void;
}

const ShortcutsContext = React.createContext<ShortcutsContextValue | null>(null);

export function ShortcutsProvider({ children }: { children: React.ReactNode }) {
  const [groups, setGroups] = React.useState<ShortcutGroup[]>([]);
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      const editable = tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable;
      if (editable) return;
      if (e.key === '?' || (e.key === '/' && (e.metaKey || e.ctrlKey))) {
        e.preventDefault();
        setOpen(o => !o);
      } else if (e.key === 'Escape' && open) {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <ShortcutsContext.Provider value={{ groups, setGroups, open, setOpen }}>
      {children}
      {open && <ShortcutsOverlay groups={groups} onClose={() => setOpen(false)} />}
    </ShortcutsContext.Provider>
  );
}

export function useShortcutsOverlay() {
  const ctx = React.useContext(ShortcutsContext);
  if (!ctx) return { setGroups: () => {}, open: false, setOpen: () => {} };
  return ctx;
}

export function useRegisterShortcuts(groups: ShortcutGroup[]) {
  const ctx = React.useContext(ShortcutsContext);
  React.useEffect(() => {
    if (!ctx) return;
    ctx.setGroups(groups);
    return () => { ctx.setGroups([]); };
  }, [JSON.stringify(groups)]);
}

function ShortcutsOverlay({ groups, onClose }: { groups: ShortcutGroup[]; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard shortcuts"
    >
      <div
        onClick={e => e.stopPropagation()}
        className="max-h-[80vh] w-[640px] max-w-[92vw] overflow-hidden rounded-xl border border-white/10 bg-[#0f1115] shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-3">
          <div className="flex items-center gap-2">
            <span className="text-base">⌨</span>
            <h2 className="text-sm font-bold text-zinc-100">Keyboard shortcuts</h2>
            <span className="text-[10px] text-zinc-500">press <kbd className="rounded bg-white/10 px-1.5 py-0.5 text-zinc-300">?</kbd> any time</span>
          </div>
          <button onClick={onClose} className="rounded p-1 text-zinc-400 hover:bg-white/5 hover:text-white" aria-label="Close">
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="max-h-[68vh] overflow-y-auto p-5">
          {groups.length === 0 ? (
            <div className="rounded border border-dashed border-white/10 p-8 text-center text-xs text-zinc-500">
              No shortcuts registered for this studio
            </div>
          ) : (
            <div className="grid gap-5 sm:grid-cols-2">
              {groups.map(g => (
                <div key={g.label}>
                  <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-cyan-300">{g.label}</div>
                  <div className="space-y-1">
                    {g.items.map(it => (
                      <div key={it.combo + it.description} className="flex items-center justify-between gap-2 rounded px-2 py-1 hover:bg-white/5">
                        <span className="text-xs text-zinc-300">{it.description}</span>
                        <kbd className="rounded bg-white/10 px-2 py-0.5 text-[10px] font-mono font-semibold text-zinc-200">
                          {formatCombo(it.combo)}
                        </kbd>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function HelpButton({ className }: { className?: string }) {
  const { setOpen } = useShortcutsOverlay();
  return (
    <button
      onClick={() => setOpen(true)}
      title="Keyboard shortcuts (?)"
      aria-label="Show keyboard shortcuts"
      className={cn(
        'inline-flex h-7 w-7 items-center justify-center rounded-md text-zinc-400 hover:bg-white/5 hover:text-zinc-100',
        className,
      )}
    >
      <span className="text-xs font-mono font-bold">?</span>
    </button>
  );
}
