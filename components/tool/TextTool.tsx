'use client';

import * as React from 'react';
import { Copy, Download, Trash2, Upload, Check } from 'lucide-react';
import { cn } from '@/lib/cn';
import { setRecent } from '@/lib/storage/recent';
import { FetchUrlBar } from '@/components/tool/FetchUrlBar';
import { useStagedInput } from '@/lib/ai/handoff';

export interface TextToolControl {
  id: string;
  label: string;
  type: 'toggle' | 'number' | 'text' | 'select';
  defaultValue: string | number | boolean;
  options?: Array<{ value: string; label: string }>;
  min?: number;
  max?: number;
  step?: number;
}

interface TextToolProps {
  toolId: string;
  /** Pure function from (input, options) → output text */
  transform: (input: string, options: Record<string, unknown>) => string;
  /** Optional controls beyond the textarea (toggles, dropdowns, numbers) */
  controls?: TextToolControl[];
  /** Placeholder for the input textarea */
  inputPlaceholder?: string;
  /** Optional stats renderer — gets called with current input + output */
  stats?: (input: string, output: string) => React.ReactNode;
  /** Accent CSS var for the category (e.g. "--color-cat-text") */
  colorVar?: string;
  /** Initial input (used by some generators that don't need user input) */
  initialInput?: string;
  /** Optional "fetch from URL" bar above the input — server fetches the page
   * (CORS-free) and drops the returned text into the input box. */
  urlFetch?: { endpoint: string; placeholder?: string };
}

/**
 * Template for any text-in / text-out tool. Handles:
 *   - large textarea with monospace optional toggle
 *   - controls panel (right side, collapses below on narrow screens)
 *   - live transform on input/option change (debounced 80ms for big inputs)
 *   - copy / download / clear / paste-from-clipboard
 *   - char/word/line stats
 *   - persists last output as a "text thumbnail" for the home-tile live preview
 *
 * Authors of new text tools only write a single pure function.
 */
export function TextTool({
  toolId,
  transform,
  controls = [],
  inputPlaceholder = 'Paste or type text…',
  stats,
  colorVar = '--color-cat-text',
  initialInput = '',
  urlFetch,
}: TextToolProps) {
  const [input, setInput] = React.useState(initialInput);
  const [options, setOptions] = React.useState<Record<string, unknown>>(() =>
    Object.fromEntries(controls.map((c) => [c.id, c.defaultValue])),
  );
  const [copied, setCopied] = React.useState(false);

  // If the user picked this tool from the homepage launcher (or the AI) with a
  // file in hand, read it as text and drop it straight into the input.
  useStagedInput((file) => {
    file.text().then((t) => setInput(t)).catch(() => { /* not text */ });
  });

  const output = React.useMemo(() => {
    try {
      return transform(input, options);
    } catch (err) {
      return `Error: ${err instanceof Error ? err.message : String(err)}`;
    }
  }, [input, options, transform]);

  // Save a "text thumbnail" for the live tile (just the first 200 chars).
  React.useEffect(() => {
    if (!output) return;
    const id = setTimeout(() => {
      const thumb = makeTextThumb(output);
      setRecent(toolId, thumb);
    }, 600);
    return () => clearTimeout(id);
  }, [output, toolId]);

  const copy = async () => {
    if (!output) return;
    await navigator.clipboard.writeText(output);
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };

  const download = () => {
    if (!output) return;
    const blob = new Blob([output], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${toolId}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const paste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setInput(text);
    } catch {
      /* user denied */
    }
  };

  const inputStats = computeStats(input);
  const outputStats = computeStats(output);

  return (
    <div className="space-y-4">
      {urlFetch && (
        <FetchUrlBar
          endpoint={urlFetch.endpoint}
          placeholder={urlFetch.placeholder}
          colorVar={colorVar}
          onText={setInput}
        />
      )}
      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
      <div className="grid gap-3 md:grid-cols-2">
        <Panel label="Input" colorVar={colorVar}>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={inputPlaceholder}
            spellCheck={false}
            className="h-72 w-full resize-none bg-transparent font-mono text-[13px] leading-relaxed text-[var(--color-fg)] placeholder:text-[var(--color-fg-subtle)] focus:outline-none"
          />
          <PanelFooter>
            <span className="font-mono text-[11px] text-[var(--color-fg-subtle)] tabular-nums">
              {inputStats.chars} chars · {inputStats.words} words · {inputStats.lines} lines
            </span>
            <div className="flex items-center gap-1">
              <IconBtn onClick={paste} title="Paste"><Upload className="h-3.5 w-3.5" /></IconBtn>
              <IconBtn onClick={() => setInput('')} title="Clear"><Trash2 className="h-3.5 w-3.5" /></IconBtn>
            </div>
          </PanelFooter>
        </Panel>

        <Panel label="Output" colorVar={colorVar} accent>
          <textarea
            value={output}
            readOnly
            placeholder="Result will appear here"
            spellCheck={false}
            className="h-72 w-full resize-none bg-transparent font-mono text-[13px] leading-relaxed text-[var(--color-fg)] placeholder:text-[var(--color-fg-subtle)] focus:outline-none"
          />
          <PanelFooter>
            <span className="font-mono text-[11px] text-[var(--color-fg-subtle)] tabular-nums">
              {outputStats.chars} chars · {outputStats.words} words · {outputStats.lines} lines
            </span>
            <div className="flex items-center gap-1">
              <IconBtn onClick={copy} title="Copy">
                {copied ? <Check className="h-3.5 w-3.5 text-[var(--color-cat-generator)]" /> : <Copy className="h-3.5 w-3.5" />}
              </IconBtn>
              <IconBtn onClick={download} title="Download"><Download className="h-3.5 w-3.5" /></IconBtn>
            </div>
          </PanelFooter>
        </Panel>
      </div>

      <aside className="space-y-3">
        {controls.length > 0 && (
          <div className="tile-surface" data-neutral="true">
            <div className="tile-content gap-3 !justify-start">
              <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">
                Options
              </div>
              {controls.map((c) => (
                <ControlRow
                  key={c.id}
                  control={c}
                  value={options[c.id]}
                  onChange={(v) => setOptions((o) => ({ ...o, [c.id]: v }))}
                  colorVar={colorVar}
                />
              ))}
            </div>
          </div>
        )}

        {stats && (
          <div className="tile-surface" data-neutral="true">
            <div className="tile-content gap-3 !justify-start">
              <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">
                Stats
              </div>
              {stats(input, output)}
            </div>
          </div>
        )}

        <div className="flex items-start gap-2 bg-black/[0.03] px-3 py-2.5 text-[11px] text-[var(--color-fg-muted)]">
          <span className="mt-1 h-1.5 w-1.5 shrink-0" style={{ background: `var(${colorVar})` }} />
          <span>Files stay yours.</span>
        </div>
      </aside>
      </div>
    </div>
  );
}

function Panel({
  label,
  colorVar,
  accent,
  children,
}: {
  label: string;
  colorVar?: string;
  accent?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn('tile-surface flex flex-col')}
      data-neutral={accent ? undefined : 'true'}
      style={
        accent
          ? { ['--tile-color' as string]: `color-mix(in oklch, var(${colorVar}) 18%, var(--color-surface-1))` }
          : undefined
      }
    >
      <div className="tile-content gap-3 !justify-start">
        <div className="flex items-center justify-between">
          <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">
            {label}
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}

function PanelFooter({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center justify-between border-t border-black/[0.06] pt-2.5">{children}</div>;
}

function IconBtn({
  children,
  onClick,
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="flex h-7 w-7 items-center justify-center text-[var(--color-fg-subtle)] transition hover:bg-black/[0.06] hover:text-[var(--color-fg)]"
    >
      {children}
    </button>
  );
}

function ControlRow({
  control,
  value,
  onChange,
  colorVar,
}: {
  control: TextToolControl;
  value: unknown;
  onChange: (v: unknown) => void;
  colorVar: string;
}) {
  if (control.type === 'toggle') {
    const v = Boolean(value);
    return (
      <button
        type="button"
        onClick={() => onChange(!v)}
        className="flex items-center justify-between px-1 py-1 text-left transition hover:bg-black/[0.03]"
      >
        <span className="text-[13px] text-[var(--color-fg)]">{control.label}</span>
        <span
          className={cn(
            'relative h-5 w-9 transition',
            v ? '' : 'bg-black/[0.12]',
          )}
          style={v ? { background: `var(${colorVar})` } : undefined}
        >
          <span
            className={cn(
              'absolute top-0.5 h-4 w-4 bg-white transition-all shadow-sm',
              v ? 'left-4' : 'left-0.5',
            )}
          />
        </span>
      </button>
    );
  }

  if (control.type === 'number') {
    return (
      <label className="flex flex-col gap-1.5">
        <span className="text-[12px] text-[var(--color-fg-muted)]">{control.label}</span>
        <input
          type="number"
          value={Number(value)}
          min={control.min}
          max={control.max}
          step={control.step ?? 1}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-full border border-black/[0.08] bg-white/60 px-2.5 py-1.5 font-mono text-[13px] text-[var(--color-fg)] focus:border-[var(--color-cat-text)] focus:outline-none"
        />
      </label>
    );
  }

  if (control.type === 'text') {
    return (
      <label className="flex flex-col gap-1.5">
        <span className="text-[12px] text-[var(--color-fg-muted)]">{control.label}</span>
        <input
          type="text"
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value)}
          className="w-full border border-black/[0.08] bg-white/60 px-2.5 py-1.5 font-mono text-[13px] text-[var(--color-fg)] focus:border-[var(--color-cat-text)] focus:outline-none"
        />
      </label>
    );
  }

  // select
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[12px] text-[var(--color-fg-muted)]">{control.label}</span>
      <select
        value={String(value)}
        onChange={(e) => onChange(e.target.value)}
        className="w-full border border-black/[0.08] bg-white/60 px-2.5 py-1.5 text-[13px] text-[var(--color-fg)] focus:border-[var(--color-cat-text)] focus:outline-none"
      >
        {control.options?.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  );
}

function computeStats(s: string) {
  return {
    chars: s.length,
    words: s.trim() ? s.trim().split(/\s+/).length : 0,
    lines: s ? s.split(/\r?\n/).length : 0,
  };
}

/** Render a tiny "text thumb" as a data URL for the home-page live tile. */
function makeTextThumb(output: string): string {
  if (typeof document === 'undefined') return '';
  const w = 192;
  const h = 144;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  ctx.fillStyle = 'oklch(95% 0.012 80)';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = 'oklch(30% 0.008 80)';
  ctx.font = '8px ui-monospace, Menlo, monospace';
  const lines = output.split('\n').slice(0, 14);
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].slice(0, 36);
    ctx.fillText(trimmed, 8, 14 + i * 9);
  }
  return canvas.toDataURL('image/jpeg', 0.5);
}
