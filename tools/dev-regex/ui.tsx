'use client';
import * as React from 'react';

/**
 * Regex tester with LIVE in-text match highlighting (regex101-style) — replaces
 * the old TextTool match-list. Type a pattern + flags and matches are
 * highlighted inline in the text as you type; a readout lists each match with
 * its captured groups. Pure client-side, no deps.
 */

interface MatchInfo { index: number; length: number; text: string; groups: (string | undefined)[]; named: Record<string, string> }

const DEFAULT_TEXT = `Contact: jane@example.com or sales@acme.io
Call +1 (555) 010-2090 — invoice INV-2024-001 due 2024-09-30.`;

export default function Tool() {
  const [pattern, setPattern] = React.useState('\\b[\\w.]+@[\\w.]+\\.\\w+\\b');
  const [flags, setFlags] = React.useState('gi');
  const [text, setText] = React.useState(DEFAULT_TEXT);
  const [replace, setReplace] = React.useState('');
  const [showReplace, setShowReplace] = React.useState(false);

  // Compile + scan. Errors surface as a message; never throws into render.
  const { matches, error, replaced } = React.useMemo(() => {
    if (!pattern) return { matches: [] as MatchInfo[], error: '', replaced: '' };
    let re: RegExp;
    try { re = new RegExp(pattern, flags.includes('g') ? flags : flags + 'g'); }
    catch (e) { return { matches: [] as MatchInfo[], error: (e as Error).message, replaced: '' }; }
    const out: MatchInfo[] = [];
    let m: RegExpExecArray | null;
    let guard = 0;
    while ((m = re.exec(text)) !== null && guard++ < 10000) {
      out.push({ index: m.index, length: m[0].length, text: m[0], groups: m.slice(1), named: { ...(m.groups ?? {}) } });
      if (m.index === re.lastIndex) re.lastIndex++;
    }
    let rep = '';
    if (showReplace) { try { rep = text.replace(new RegExp(pattern, flags), replace); } catch { rep = ''; } }
    return { matches: out, error: '', replaced: rep };
  }, [pattern, flags, text, replace, showReplace]);

  // Build highlighted segments from match spans (non-overlapping, in order).
  const segments = React.useMemo(() => {
    const segs: { text: string; hit: boolean }[] = [];
    let cursor = 0;
    for (const mt of matches) {
      if (mt.index < cursor) continue; // skip overlaps from zero-width bumps
      if (mt.index > cursor) segs.push({ text: text.slice(cursor, mt.index), hit: false });
      segs.push({ text: text.slice(mt.index, mt.index + mt.length) || '∅', hit: true });
      cursor = mt.index + mt.length;
    }
    if (cursor < text.length) segs.push({ text: text.slice(cursor), hit: false });
    return segs;
  }, [matches, text]);

  const input = 'w-full border border-black/[0.1] bg-[var(--color-surface-1)] px-2.5 py-1.5 font-mono text-[13px] text-[var(--color-fg)] outline-none focus:border-[var(--color-cat-dev)]';

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-[15px] text-[var(--color-fg-muted)]">/</span>
        <input value={pattern} onChange={(e) => setPattern(e.target.value)} placeholder="pattern" className={input + ' flex-1 min-w-[200px]'} spellCheck={false} />
        <span className="font-mono text-[15px] text-[var(--color-fg-muted)]">/</span>
        <input value={flags} onChange={(e) => setFlags(e.target.value.replace(/[^gimsuy]/g, ''))} placeholder="flags" className={input + ' w-20'} spellCheck={false} />
        <label className="flex items-center gap-1.5 text-[12px] text-[var(--color-fg-muted)]">
          <input type="checkbox" checked={showReplace} onChange={(e) => setShowReplace(e.target.checked)} /> Replace
        </label>
      </div>
      {showReplace && (
        <input value={replace} onChange={(e) => setReplace(e.target.value)} placeholder="Replacement (supports $1, $2, $<name>)" className={input} spellCheck={false} />
      )}
      {error
        ? <div className="border border-red-500/30 bg-red-500/10 px-2.5 py-1.5 text-[12px] text-red-600">Invalid regex: {error}</div>
        : <div className="text-[12px] text-[var(--color-fg-muted)]">{matches.length} match{matches.length === 1 ? '' : 'es'}</div>}

      <div className="grid gap-3 lg:grid-cols-2">
        <div>
          <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-[var(--color-fg-subtle)]">Test text</div>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={10}
            className="w-full resize-y border border-black/[0.1] bg-[var(--color-surface-1)] p-2.5 font-mono text-[13px] leading-relaxed text-[var(--color-fg)] outline-none focus:border-[var(--color-cat-dev)]" spellCheck={false} />
        </div>
        <div>
          <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-[var(--color-fg-subtle)]">{showReplace ? 'Replaced' : 'Matches highlighted'}</div>
          <div className="min-h-[244px] whitespace-pre-wrap break-words border border-black/[0.1] bg-[var(--color-canvas)] p-2.5 font-mono text-[13px] leading-relaxed">
            {showReplace
              ? <span className="text-[var(--color-fg)]">{replaced}</span>
              : segments.map((s, i) => s.hit
                  ? <mark key={i} className="rounded bg-[var(--color-cat-dev)]/30 text-[var(--color-fg)] ring-1 ring-[var(--color-cat-dev)]/50">{s.text}</mark>
                  : <span key={i} className="text-[var(--color-fg-muted)]">{s.text}</span>)}
          </div>
        </div>
      </div>

      {!showReplace && matches.length > 0 && (
        <div>
          <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-[var(--color-fg-subtle)]">Captured groups</div>
          <div className="max-h-56 space-y-1 overflow-y-auto">
            {matches.slice(0, 200).map((m, i) => (
              <div key={i} className="border border-black/[0.06] bg-[var(--color-surface-1)] px-2.5 py-1 font-mono text-[12px]">
                <span className="text-[var(--color-fg-subtle)]">@{m.index}</span>{' '}
                <span className="text-[var(--color-fg)]">{m.text}</span>
                {m.groups.length > 0 && (
                  <span className="text-[var(--color-fg-muted)]">
                    {m.groups.map((g, j) => <span key={j}> · [{j + 1}] {g ?? '∅'}</span>)}
                  </span>
                )}
                {Object.entries(m.named).map(([k, v]) => <span key={k} className="text-[var(--color-cat-dev)]"> · {k}={v}</span>)}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
