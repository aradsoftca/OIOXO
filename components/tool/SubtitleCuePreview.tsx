'use client';

import * as React from 'react';
import { parse, formatSrt, stripTags, type Cue } from '@/engines/subtitle';

/**
 * Compact, read-only cue preview for subtitle tools. Parses an SRT/VTT string and
 * shows the first N cues as timestamp → text rows, plus a header summary (cue
 * count, total duration, any zero/negative-duration or overlap warnings). This is
 * the "see the cues" affordance that makes subtitle tools feel real instead of a
 * raw text box. Pure render — never throws on bad input (shows nothing).
 */
export function SubtitleCuePreview({ text, max = 60 }: { text: string; max?: number }) {
  const cues = React.useMemo<Cue[]>(() => {
    try { return parse(text); } catch { return []; }
  }, [text]);

  if (cues.length === 0) return null;

  const last = cues[cues.length - 1];
  const totalSec = Math.max(0, last.end);
  // Health checks the user actually cares about.
  let zeroDur = 0;
  let overlaps = 0;
  for (let i = 0; i < cues.length; i++) {
    if (cues[i].end <= cues[i].start) zeroDur++;
    if (i > 0 && cues[i].start < cues[i - 1].end) overlaps++;
  }

  const shown = cues.slice(0, max);

  return (
    <div className="tile-surface" data-neutral="true">
      <div className="tile-content gap-2.5 !justify-start">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">
            Preview
          </div>
          <span className="font-mono text-[11px] text-[var(--color-fg-subtle)] tabular-nums">
            {cues.length} cues · {fmtDur(totalSec)}
          </span>
          {zeroDur > 0 && (
            <span className="bg-[var(--color-cat-subtitle)]/12 px-1.5 py-0.5 font-mono text-[11px] text-[var(--color-cat-subtitle)]">
              {zeroDur} zero-length
            </span>
          )}
          {overlaps > 0 && (
            <span className="bg-amber-500/12 px-1.5 py-0.5 font-mono text-[11px] text-amber-600">
              {overlaps} overlap{overlaps > 1 ? 's' : ''}
            </span>
          )}
        </div>

        <div className="max-h-64 divide-y divide-black/[0.05] overflow-y-auto border border-black/[0.06] bg-white/40">
          {shown.map((c, i) => {
            const bad = c.end <= c.start;
            return (
              <div key={i} className="flex gap-3 px-2.5 py-1.5">
                <span
                  className="shrink-0 font-mono text-[11px] leading-relaxed tabular-nums text-[var(--color-fg-subtle)]"
                  title={`${formatSrt(c.start)} → ${formatSrt(c.end)}`}
                >
                  {clock(c.start)}
                  <span className={bad ? 'text-[var(--color-cat-subtitle)]' : ''}> → {clock(c.end)}</span>
                </span>
                <span className="min-w-0 whitespace-pre-wrap break-words text-[12px] leading-relaxed text-[var(--color-fg)]">
                  {stripTags(c.text) || <span className="text-[var(--color-fg-subtle)] italic">(empty)</span>}
                </span>
              </div>
            );
          })}
          {cues.length > shown.length && (
            <div className="px-2.5 py-1.5 text-center font-mono text-[11px] text-[var(--color-fg-subtle)]">
              + {cues.length - shown.length} more cues
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** mm:ss.t clock for the row (compact). */
function clock(sec: number): string {
  if (sec < 0) sec = 0;
  const total = Math.round(sec * 10) / 10;
  const m = Math.floor(total / 60);
  const s = Math.floor(total % 60);
  const t = Math.round((total - Math.floor(total)) * 10);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${t}`;
}

/** Human total duration, e.g. "1h 04m" or "3m 12s". */
function fmtDur(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  if (m > 0) return `${m}m ${String(s).padStart(2, '0')}s`;
  return `${s}s`;
}
