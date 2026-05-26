'use client';
/**
 * oioxo Code — the COMMAND PALETTE (the most "VS Code" affordance there is). Open
 * with Cmd/Ctrl+K or Cmd/Ctrl+P, fuzzy-filter actions + open files, run with Enter.
 * Self-contained: it owns its open state via a window key listener; the parent just
 * hands it a flat list of commands.
 */
import * as React from 'react';
import { Search, CornerDownLeft } from 'lucide-react';

export interface PaletteCommand {
  id: string;
  label: string;
  /** Right-aligned hint (e.g. a shortcut or path). */
  hint?: string;
  /** Section label (e.g. "Actions", "Files"). */
  group?: string;
  run: () => void;
}

/** Lightweight subsequence fuzzy match + score (lower = better). */
function score(query: string, text: string): number | null {
  if (!query) return 0;
  const q = query.toLowerCase(), t = text.toLowerCase();
  let qi = 0, ti = 0, last = -1, gaps = 0;
  while (qi < q.length && ti < t.length) {
    if (q[qi] === t[ti]) { if (last >= 0) gaps += ti - last - 1; last = ti; qi++; }
    ti++;
  }
  return qi === q.length ? gaps + (t.startsWith(q) ? -5 : 0) : null;
}

export default function CommandPalette({ commands }: { commands: PaletteCommand[] }) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const [active, setActive] = React.useState(0);
  const inputRef = React.useRef<HTMLInputElement>(null);

  // Global open shortcut (Cmd/Ctrl+K or Cmd/Ctrl+P).
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && ['k', 'p'].includes(e.key.toLowerCase())) {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === 'Escape') {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  React.useEffect(() => { if (open) { setQuery(''); setActive(0); setTimeout(() => inputRef.current?.focus(), 0); } }, [open]);

  const results = React.useMemo(() => {
    const scored = commands
      .map((c) => ({ c, s: score(query, c.label + ' ' + (c.hint ?? '')) }))
      .filter((x): x is { c: PaletteCommand; s: number } => x.s !== null)
      .sort((a, b) => a.s - b.s);
    return scored.map((x) => x.c).slice(0, 50);
  }, [query, commands]);

  React.useEffect(() => { setActive((a) => Math.min(a, Math.max(0, results.length - 1))); }, [results.length]);

  if (!open) return null;

  const choose = (cmd?: PaletteCommand) => { if (cmd) { setOpen(false); cmd.run(); } };

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center bg-black/30 pt-[12vh]" onClick={() => setOpen(false)}>
      <div className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b border-zinc-200 px-3">
          <Search className="h-4 w-4 shrink-0 text-zinc-400" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)); }
              else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
              else if (e.key === 'Enter') { e.preventDefault(); choose(results[active]); }
            }}
            placeholder="Run a command or open a file…"
            className="flex-1 bg-transparent py-3 text-sm placeholder:text-zinc-400 focus:outline-none"
          />
        </div>
        <ul className="max-h-80 overflow-auto py-1">
          {results.length === 0 && <li className="px-4 py-6 text-center text-sm text-zinc-400">No matches</li>}
          {results.map((c, i) => (
            <li key={c.id}>
              <button
                type="button"
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(c)}
                className={['flex w-full items-center gap-2 px-4 py-2 text-left text-[13px]', i === active ? 'bg-[#E2B24A]/15 text-zinc-900' : 'text-zinc-700'].join(' ')}
              >
                {c.group && <span className="shrink-0 rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-500">{c.group}</span>}
                <span className="min-w-0 flex-1 truncate">{c.label}</span>
                {c.hint && <span className="shrink-0 text-[11px] text-zinc-400">{c.hint}</span>}
                {i === active && <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-zinc-400" />}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
