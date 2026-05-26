'use client';
/**
 * oioxo Code — EDITOR SETTINGS. A small, persisted preference store (theme, font
 * size, word wrap, minimap, tab size) + a gear popover to change them. Shared
 * across every editor instance via a localStorage-backed store + a window event,
 * so CodeEditor just reads `useEditorSettings()` — no prop drilling.
 */
import * as React from 'react';
import { Settings, X } from 'lucide-react';

export interface EditorSettings {
  theme: 'light' | 'oioxo-dark';
  fontSize: number;
  wordWrap: boolean;
  minimap: boolean;
  tabSize: number;
}

const DEFAULTS: EditorSettings = { theme: 'light', fontSize: 13, wordWrap: true, minimap: false, tabSize: 2 };
const KEY = 'oioxo.editor.settings';
const EVT = 'oioxo:editor-settings';

function load(): EditorSettings {
  try {
    return typeof localStorage === 'undefined' ? DEFAULTS : { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY) || '{}')) };
  } catch { return DEFAULTS; }
}

/** Read + update editor settings (synced across instances). */
export function useEditorSettings(): [EditorSettings, (patch: Partial<EditorSettings>) => void] {
  const [s, setS] = React.useState<EditorSettings>(DEFAULTS);
  React.useEffect(() => {
    setS(load());
    const on = () => setS(load());
    window.addEventListener(EVT, on);
    return () => window.removeEventListener(EVT, on);
  }, []);
  const update = React.useCallback((patch: Partial<EditorSettings>) => {
    const next = { ...load(), ...patch };
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* private mode */ }
    window.dispatchEvent(new Event(EVT));
    setS(next);
  }, []);
  return [s, update];
}

/** Gear button + settings popover (drop it into any editor toolbar). */
export default function EditorSettingsButton() {
  const [open, setOpen] = React.useState(false);
  const [s, update] = useEditorSettings();
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!open) return;
    const on = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    window.addEventListener('mousedown', on);
    return () => window.removeEventListener('mousedown', on);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen((v) => !v)} title="Editor settings" className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700">
        <Settings className="h-3.5 w-3.5" />
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-1 w-56 rounded-xl border border-zinc-200 bg-white p-3 text-[12px] shadow-xl">
          <div className="mb-2 flex items-center justify-between">
            <span className="font-semibold text-zinc-700">Editor</span>
            <button type="button" onClick={() => setOpen(false)} className="text-zinc-400 hover:text-zinc-700"><X className="h-3.5 w-3.5" /></button>
          </div>
          <label className="mb-2 flex items-center justify-between gap-2">
            <span className="text-zinc-600">Theme</span>
            <select value={s.theme} onChange={(e) => update({ theme: e.target.value as EditorSettings['theme'] })} className="rounded border border-zinc-300 bg-white px-1.5 py-0.5">
              <option value="light">Light</option>
              <option value="oioxo-dark">oioxo Dark</option>
            </select>
          </label>
          <label className="mb-2 flex items-center justify-between gap-2">
            <span className="text-zinc-600">Font size</span>
            <input type="number" min={10} max={24} value={s.fontSize} onChange={(e) => update({ fontSize: Math.min(24, Math.max(10, Number(e.target.value) || 13)) })} className="w-14 rounded border border-zinc-300 px-1.5 py-0.5" />
          </label>
          <label className="mb-2 flex items-center justify-between gap-2">
            <span className="text-zinc-600">Tab size</span>
            <select value={s.tabSize} onChange={(e) => update({ tabSize: Number(e.target.value) })} className="rounded border border-zinc-300 bg-white px-1.5 py-0.5">
              <option value={2}>2</option><option value={4}>4</option><option value={8}>8</option>
            </select>
          </label>
          <label className="mb-1.5 flex items-center justify-between gap-2">
            <span className="text-zinc-600">Word wrap</span>
            <input type="checkbox" checked={s.wordWrap} onChange={(e) => update({ wordWrap: e.target.checked })} className="accent-[#E2B24A]" />
          </label>
          <label className="flex items-center justify-between gap-2">
            <span className="text-zinc-600">Minimap</span>
            <input type="checkbox" checked={s.minimap} onChange={(e) => update({ minimap: e.target.checked })} className="accent-[#E2B24A]" />
          </label>
        </div>
      )}
    </div>
  );
}
