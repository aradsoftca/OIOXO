'use client';

import * as React from 'react';
import { cn } from '@/lib/cn';
import { AUDIO_EFFECTS, EFFECT_CATEGORIES, makeAppliedEffect, type AppliedEffect, type EffectCategory, type EffectDef } from './effect-presets';
import { PresetBar } from './presets-ui';

/** A pluggable effect catalog so the SAME rack serves audio, video, image, …
 *  (C2 shared engine). Defaults to the audio catalog for back-compat. */
export interface EffectCatalog {
  effects: EffectDef[];
  categories: { id: string; label: string }[];
}
const AUDIO_CATALOG: EffectCatalog = { effects: AUDIO_EFFECTS, categories: EFFECT_CATEGORIES };

export function EffectsRack({ value, onChange, title = 'Effects', catalog = AUDIO_CATALOG, presetKind }: {
  value: AppliedEffect[];
  onChange: (next: AppliedEffect[]) => void;
  title?: string;
  /** Effect definitions + categories this rack offers. */
  catalog?: EffectCatalog;
  /** When set, shows a C4 preset bar to save/apply the WHOLE chain by name. */
  presetKind?: string;
}) {
  const [adding, setAdding] = React.useState(false);

  const update = (uid: string, mut: (e: AppliedEffect) => void) => {
    onChange(value.map(e => e.uid === uid ? (mut(e), { ...e, params: { ...e.params } }) : e));
  };
  const remove = (uid: string) => onChange(value.filter(e => e.uid !== uid));
  const moveUp = (uid: string) => {
    const i = value.findIndex(e => e.uid === uid);
    if (i <= 0) return;
    const next = [...value];
    [next[i - 1], next[i]] = [next[i], next[i - 1]];
    onChange(next);
  };
  const moveDown = (uid: string) => {
    const i = value.findIndex(e => e.uid === uid);
    if (i < 0 || i === value.length - 1) return;
    const next = [...value];
    [next[i + 1], next[i]] = [next[i], next[i + 1]];
    onChange(next);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-1 px-3 py-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">{title}</span>
        <div className="flex items-center gap-1">
          {presetKind && (
            <PresetBar<AppliedEffect[]>
              kind={presetKind}
              label="Chains"
              capture={() => value.map(e => ({ ...e, params: { ...e.params } }))}
              onApply={(chain) => onChange(chain.map(e => ({ ...e, uid: makeAppliedEffect(e.effectId).uid })))}
            />
          )}
          <button onClick={() => setAdding(true)} className="rounded bg-cyan-500/15 px-2 py-1 text-[10px] font-semibold text-cyan-200 hover:bg-cyan-500/25">+ Add effect</button>
        </div>
      </div>

      <div className="space-y-1.5 px-3">
        {value.length === 0 ? (
          <div className="rounded border border-dashed border-white/10 px-3 py-4 text-center text-xs text-zinc-500">
            No effects. Click "+ Add effect" to start.
          </div>
        ) : value.map((eff, i) => (
          <EffectCard
            key={eff.uid}
            effect={eff}
            catalog={catalog}
            first={i === 0}
            last={i === value.length - 1}
            onUpdate={(mut) => update(eff.uid, mut)}
            onRemove={() => remove(eff.uid)}
            onUp={() => moveUp(eff.uid)}
            onDown={() => moveDown(eff.uid)}
          />
        ))}
      </div>

      {adding && (
        <EffectPickerDialog
          catalog={catalog}
          onCancel={() => setAdding(false)}
          onPick={(effectId) => {
            onChange([...value, makeAppliedEffect(effectId)]);
            setAdding(false);
          }}
        />
      )}
    </div>
  );
}

function EffectCard({ effect, catalog, first, last, onUpdate, onRemove, onUp, onDown }: {
  effect: AppliedEffect;
  catalog: EffectCatalog;
  first: boolean;
  last: boolean;
  onUpdate: (mut: (e: AppliedEffect) => void) => void;
  onRemove: () => void;
  onUp: () => void;
  onDown: () => void;
}) {
  const def = catalog.effects.find(d => d.id === effect.effectId);
  const [expanded, setExpanded] = React.useState(true);
  if (!def) return null;
  return (
    <div className={cn('rounded-md border transition', effect.bypassed ? 'border-white/5 bg-white/[.01] opacity-50' : 'border-white/10 bg-white/[.03]')}>
      <div className="flex items-center gap-1 px-2 py-1.5">
        <button
          onClick={() => onUpdate(e => { e.bypassed = !e.bypassed; })}
          title={effect.bypassed ? 'Enabled' : 'Bypass'}
          className={cn('h-4 w-4 rounded border-2 transition', effect.bypassed ? 'border-zinc-500 bg-zinc-700' : 'border-cyan-400 bg-cyan-400 shadow-[0_0_4px_rgba(34,211,238,.4)]')}
        />
        <button onClick={() => setExpanded(e => !e)} className="flex-1 truncate text-left text-xs font-medium text-zinc-100">
          {def.name}
        </button>
        <button onClick={onUp} disabled={first} className="text-zinc-500 hover:text-zinc-200 disabled:opacity-30 text-xs px-0.5">▲</button>
        <button onClick={onDown} disabled={last} className="text-zinc-500 hover:text-zinc-200 disabled:opacity-30 text-xs px-0.5">▼</button>
        <button onClick={onRemove} className="text-rose-400/70 hover:text-rose-300 px-0.5">
          <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M18 6 6 18M6 6l12 12" /></svg>
        </button>
      </div>
      {expanded && def.params.length > 0 && (
        <div className="space-y-1.5 border-t border-white/5 px-2 py-1.5">
          {def.params.map(p => (
            <ParamControl
              key={p.id}
              param={p}
              value={effect.params[p.id] ?? p.default}
              onChange={(v) => onUpdate(e => { e.params[p.id] = v; })}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ParamControl({ param, value, onChange }: { param: any; value: any; onChange: (v: any) => void }) {
  if (param.kind === 'enum') {
    return (
      <label className="flex items-center justify-between gap-2 text-[10px] text-zinc-400">
        <span>{param.label}</span>
        <select value={String(value)} onChange={e => onChange(e.target.value)} className="rounded border border-white/10 bg-[#0a0b0e] px-1.5 py-0.5 text-[10px] text-zinc-100">
          {param.options.map((o: string) => <option key={o} value={o}>{o}</option>)}
        </select>
      </label>
    );
  }
  if (param.kind === 'boolean') {
    return (
      <label className="flex items-center justify-between gap-2 text-[10px] text-zinc-400">
        <span>{param.label}</span>
        <input type="checkbox" checked={!!value} onChange={e => onChange(e.target.checked)} />
      </label>
    );
  }
  const num = typeof value === 'number' ? value : param.default;
  return (
    <div className="space-y-0.5">
      <div className="flex items-center justify-between text-[10px] text-zinc-400">
        <span>{param.label}</span>
        <span className="tabular-nums text-zinc-300">{Number(num.toFixed(2))}{param.suffix ?? ''}</span>
      </div>
      <input
        type="range"
        min={param.min ?? 0}
        max={param.max ?? 100}
        step={param.step ?? 1}
        value={num}
        onChange={e => onChange(parseFloat(e.target.value))}
        className="h-1 w-full"
      />
    </div>
  );
}

function EffectPickerDialog({ catalog, onCancel, onPick }: { catalog: EffectCatalog; onCancel: () => void; onPick: (effectId: string) => void }) {
  const [cat, setCat] = React.useState<string>(catalog.categories[0]?.id ?? 'eq');
  const inCat = catalog.effects.filter(e => e.category === cat);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onCancel}>
      <div onClick={e => e.stopPropagation()} className="flex h-[60vh] w-[560px] flex-col rounded-lg border border-white/10 bg-[#111317] shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/5 px-4 py-3">
          <h3 className="text-sm font-semibold text-zinc-100">Add effect</h3>
          <button onClick={onCancel} className="rounded p-1 text-zinc-400 hover:bg-white/5"><svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M18 6 6 18M6 6l12 12" /></svg></button>
        </div>
        <div className="flex flex-1 min-h-0">
          <div className="w-32 shrink-0 border-r border-white/5 p-1">
            {catalog.categories.map(c => (
              <button key={c.id} onClick={() => setCat(c.id)} className={cn(
                'flex w-full items-center rounded px-2 py-1.5 text-left text-xs',
                cat === c.id ? 'bg-cyan-500/15 text-cyan-200' : 'text-zinc-300 hover:bg-white/5'
              )}>
                {c.label}
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-y-auto p-3">
            <div className="grid grid-cols-2 gap-1.5">
              {inCat.map(e => (
                <button key={e.id} onClick={() => onPick(e.id)} className="rounded border border-white/10 bg-white/[.02] p-3 text-left hover:bg-white/5 hover:border-cyan-400/30">
                  <div className="text-xs font-semibold text-zinc-100">{e.name}</div>
                  <div className="mt-0.5 text-[10px] text-zinc-400">{e.description}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
