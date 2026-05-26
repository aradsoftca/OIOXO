'use client';
/**
 * oioxo Code — the PROBLEMS panel. Lists the project's type diagnostics (from the
 * in-browser oracle) and jumps to the offending line on click. Collapsible footer
 * strip, VS Code-style, so the editor finally shows errors instead of hiding them.
 */
import * as React from 'react';
import { AlertCircle, ChevronUp, Check, Loader2 } from 'lucide-react';
import type { ProblemItem } from './useDiagnostics';

export default function ProblemsPanel({
  problems, running, onJump,
}: {
  problems: ProblemItem[];
  running: boolean;
  onJump: (file: string, line: number, column: number) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const count = problems.length;
  return (
    <div className="shrink-0 border-t border-zinc-200 bg-white">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11px] font-semibold text-zinc-600 hover:bg-zinc-50"
      >
        {running ? <Loader2 className="h-3.5 w-3.5 animate-spin text-zinc-400" />
          : count > 0 ? <AlertCircle className="h-3.5 w-3.5 text-rose-500" />
            : <Check className="h-3.5 w-3.5 text-green-600" />}
        Problems
        <span className={['rounded px-1.5 py-0.5 text-[10px] font-bold', count > 0 ? 'bg-rose-100 text-rose-700' : 'bg-zinc-100 text-zinc-500'].join(' ')}>
          {count}
        </span>
        {!running && count === 0 && <span className="text-[10px] font-normal text-zinc-400">no type errors</span>}
        <ChevronUp className={`ml-auto h-3.5 w-3.5 text-zinc-400 transition-transform ${open ? '' : 'rotate-180'}`} />
      </button>
      {open && count > 0 && (
        <ul className="max-h-40 overflow-auto border-t border-zinc-100">
          {problems.map((p, i) => (
            <li key={i}>
              <button
                type="button"
                onClick={() => onJump(p.file, p.line, p.column)}
                className="flex w-full items-start gap-2 px-3 py-1 text-left text-[11px] hover:bg-rose-50"
              >
                <AlertCircle className="mt-0.5 h-3 w-3 shrink-0 text-rose-500" />
                <span className="min-w-0 flex-1">
                  <span className="text-zinc-700">{p.message}</span>
                  <span className="ml-1.5 text-zinc-400">{p.file.split('/').pop()}:{p.line}:{p.column}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
