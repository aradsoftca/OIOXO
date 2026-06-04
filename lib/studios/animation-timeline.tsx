'use client';

import * as React from 'react';
import { cn } from '@/lib/cn';
import {
  ANIMATION_CATALOG, defaultAnimation, type AnimationKind, type AnimationStyle, type EasingFn, type ElementAnimation,
} from './animation-presets';

export interface AnimationConfig {
  entrance?: ElementAnimation;
  emphasis?: ElementAnimation;
  exit?: ElementAnimation;
}

export function AnimationPanel({ value, onChange, title = 'Animations' }: {
  value: AnimationConfig;
  onChange: (next: AnimationConfig) => void;
  title?: string;
}) {
  return (
    <div className="space-y-2">
      <div className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">{title}</div>
      <AnimationSlot kind="entrance" value={value.entrance} onChange={(v) => onChange({ ...value, entrance: v })} />
      <AnimationSlot kind="emphasis" value={value.emphasis} onChange={(v) => onChange({ ...value, emphasis: v })} />
      <AnimationSlot kind="exit" value={value.exit} onChange={(v) => onChange({ ...value, exit: v })} />
    </div>
  );
}

const SLOT_BG: Record<AnimationKind, string> = {
  entrance: 'border-emerald-500/30 bg-emerald-500/5',
  emphasis: 'border-amber-500/30 bg-amber-500/5',
  exit:     'border-rose-500/30 bg-rose-500/5',
};
const SLOT_LABEL: Record<AnimationKind, string> = {
  entrance: 'Entrance',
  emphasis: 'Emphasis',
  exit:     'Exit',
};

function AnimationSlot({ kind, value, onChange }: {
  kind: AnimationKind;
  value: ElementAnimation | undefined;
  onChange: (next: ElementAnimation | undefined) => void;
}) {
  const [picker, setPicker] = React.useState(false);
  const styles = ANIMATION_CATALOG.filter(c => c.kind === kind || c.kind === 'any');

  return (
    <div className={cn('mx-3 rounded border p-2', SLOT_BG[kind])}>
      <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-zinc-400">
        <span>{SLOT_LABEL[kind]}</span>
        {value && (
          <button onClick={() => onChange(undefined)} className="text-zinc-500 hover:text-rose-300">remove</button>
        )}
      </div>
      {!value ? (
        <button onClick={() => setPicker(true)} className="mt-1 w-full rounded border border-dashed border-white/15 px-2 py-2 text-xs text-zinc-400 hover:bg-white/5">
          + Add {SLOT_LABEL[kind].toLowerCase()}
        </button>
      ) : (
        <div className="mt-1 space-y-2">
          <button onClick={() => setPicker(true)} className="flex w-full items-center justify-between rounded bg-white/5 px-2 py-1.5 text-left text-xs text-zinc-100 hover:bg-white/10">
            <span className="font-medium">{styles.find(s => s.style === value.style)?.label ?? value.style}</span>
            <span className="text-zinc-500">change</span>
          </button>
          <div className="grid grid-cols-2 gap-1.5">
            <NumField label="Dur (s)" value={value.duration} step={0.1} min={0.1} max={10} onChange={v => onChange({ ...value, duration: v })} />
            <NumField label="Delay" value={value.delay} step={0.1} min={0} max={10} onChange={v => onChange({ ...value, delay: v })} />
          </div>
          <SelectField label="Easing" value={value.easing} options={['linear', 'ease-in', 'ease-out', 'ease-in-out', 'bounce-out', 'elastic-out']} onChange={v => onChange({ ...value, easing: v as EasingFn })} />
          {kind === 'emphasis' && (
            <NumField label="Repeat" value={value.repeat ?? 1} step={1} min={1} max={20} onChange={v => onChange({ ...value, repeat: Math.round(v) })} />
          )}
        </div>
      )}
      {picker && (
        <StylePickerDialog
          kind={kind}
          current={value?.style}
          onPick={(style) => {
            onChange(defaultAnimation(style, kind));
            setPicker(false);
          }}
          onCancel={() => setPicker(false)}
        />
      )}
    </div>
  );
}

function StylePickerDialog({ kind, current, onPick, onCancel }: {
  kind: AnimationKind;
  current: AnimationStyle | undefined;
  onPick: (style: AnimationStyle) => void;
  onCancel: () => void;
}) {
  const styles = ANIMATION_CATALOG.filter(c => c.kind === kind || c.kind === 'any');
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onCancel}>
      <div onClick={e => e.stopPropagation()} className="w-[460px] max-h-[80vh] overflow-y-auto rounded-lg border border-white/10 bg-[#111317] p-4 shadow-2xl">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-zinc-100">Pick {SLOT_LABEL[kind].toLowerCase()} animation</h3>
          <button onClick={onCancel} className="rounded p-1 text-zinc-400 hover:bg-white/5"><svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M18 6 6 18M6 6l12 12" /></svg></button>
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {styles.map(s => (
            <button key={s.style} onClick={() => onPick(s.style)} title={s.description} className={cn(
              'flex flex-col items-center gap-1 rounded border p-2 text-center text-xs transition',
              current === s.style ? 'border-cyan-400 bg-cyan-500/10 text-cyan-200' : 'border-white/10 bg-white/[.02] text-zinc-200 hover:bg-white/5 hover:border-white/20'
            )}>
              <span className="text-lg leading-none">{s.preview}</span>
              <span className="font-medium">{s.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function NumField({ label, value, step = 0.1, min, max, onChange }: { label: string; value: number; step?: number; min?: number; max?: number; onChange: (n: number) => void }) {
  return (
    <label className="block text-[10px] text-zinc-400">
      <span>{label}</span>
      <input type="number" value={Number(value.toFixed(2))} step={step} min={min} max={max} onChange={e => onChange(parseFloat(e.target.value || '0'))} className="mt-0.5 w-full rounded border border-white/10 bg-[#0a0b0e] px-1.5 py-1 text-right text-xs text-zinc-100" />
    </label>
  );
}

function SelectField({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <label className="block text-[10px] text-zinc-400">
      <span>{label}</span>
      <select value={value} onChange={e => onChange(e.target.value)} className="mt-0.5 w-full rounded border border-white/10 bg-[#0a0b0e] px-1.5 py-1 text-xs text-zinc-100">
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  );
}

export function totalAnimationDuration(c: AnimationConfig): number {
  const parts = [c.entrance, c.emphasis, c.exit].filter(Boolean) as ElementAnimation[];
  if (!parts.length) return 0;
  return parts.reduce((sum, a) => sum + a.duration + a.delay, 0);
}
