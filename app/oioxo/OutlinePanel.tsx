'use client';
/**
 * oioxo Code — OUTLINE panel. Shows the current file's top-level symbols (from
 * lib/oioxo/outline) and jumps to one on click. Collapsible, VS Code-style.
 */
import * as React from 'react';
import { ListTree, ChevronUp } from 'lucide-react';
import type { OutlineItem, OutlineKind } from '@/lib/oioxo/outline';

const BADGE: Record<OutlineKind, { t: string; c: string }> = {
  function: { t: 'ƒ', c: 'text-violet-600' },
  class: { t: 'C', c: 'text-amber-600' },
  interface: { t: 'I', c: 'text-sky-600' },
  type: { t: 'T', c: 'text-teal-600' },
  variable: { t: 'v', c: 'text-zinc-500' },
  selector: { t: '{}', c: 'text-rose-500' },
  rule: { t: '@', c: 'text-rose-500' },
  heading: { t: '#', c: 'text-zinc-500' },
};

export default function OutlinePanel({ items, onJump }: { items: OutlineItem[]; onJump: (line: number) => void }) {
  const [open, setOpen] = React.useState(false);
  if (items.length === 0) return null;
  return (
    <div className="border-t border-zinc-100">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1.5 px-2 py-1.5 text-left text-[11px] font-semibold text-zinc-500 hover:bg-zinc-50"
      >
        <ListTree className="h-3.5 w-3.5" /> Outline
        <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-bold text-zinc-500">{items.length}</span>
        <ChevronUp className={`ml-auto h-3.5 w-3.5 text-zinc-400 transition-transform ${open ? '' : 'rotate-180'}`} />
      </button>
      {open && (
        <ul className="max-h-44 overflow-auto pb-1">
          {items.map((s, i) => {
            const b = BADGE[s.kind];
            return (
              <li key={i}>
                <button
                  type="button"
                  onClick={() => onJump(s.line)}
                  style={{ paddingLeft: (s.depth ? (s.depth - 1) * 10 : 0) + 10 }}
                  className="flex w-full items-center gap-1.5 py-0.5 pr-2 text-left text-[12px] text-zinc-600 hover:bg-zinc-50"
                  title={`${s.kind} · line ${s.line}`}
                >
                  <span className={`w-3 shrink-0 text-center text-[10px] font-bold ${b.c}`}>{b.t}</span>
                  <span className="truncate">{s.name}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
