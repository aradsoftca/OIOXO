'use client';

/**
 * C1 — shared keyframe-aware slider (campaign engine). A drop-in control that
 * animates ANY numeric parameter via the keyframe engine (lib/studios/keyframes):
 * shows the value sampled at the current `time`, a ◆ to add a keyframe at the
 * playhead, an easing picker, a KF count badge, and a clear button. Decoupled
 * from any studio's clip model — it takes an AnimatedParam directly — so video,
 * image (layer anim), slides (element sequencer) and audio (automation) all
 * reuse it. Generalizes the video studio's AnimatableSlider.
 */

import * as React from 'react';
import { type AnimatedParam, sampleAnimated, addKeyframe, makeStatic, type Keyframe } from './keyframes';

type Easing = NonNullable<Keyframe['easing']>;

export function KeyframeSlider({
  label, min, max, step, suffix, format,
  param, staticValue, time, onChange, className,
}: {
  label: string;
  min: number; max: number; step?: number; suffix?: string;
  format?: (v: number) => string;
  /** The animated parameter (or undefined when the param is still static). */
  param?: AnimatedParam<number>;
  /** Current static value used when `param` has no keyframes. */
  staticValue: number;
  /** Playhead time (same units as the keyframes' `t`). */
  time: number;
  /** Called with the updated AnimatedParam. The host stores it on its model. */
  onChange: (next: AnimatedParam<number>, sampledValue: number) => void;
  className?: string;
}) {
  const animated = !!param && param.keyframes.length > 0;
  const sampled = animated ? sampleAnimated(param!, time) : staticValue;
  const [easing, setEasing] = React.useState<Easing>('ease-in-out');

  const addKf = () => {
    const base = param ?? makeStatic(staticValue);
    onChange(addKeyframe(base, time, sampled, easing), sampled);
  };
  const clearKf = () => onChange(makeStatic(sampled), sampled);
  const setVal = (v: number) => {
    if (animated) onChange(addKeyframe(param!, time, v, easing), v);
    else onChange(makeStatic(v), v); // stays "static" (1 KF) until a 2nd is added
  };

  return (
    <div className={className ?? 'space-y-0.5'}>
      <div className="flex items-center justify-between text-[10px] text-zinc-400">
        <span className="flex items-center gap-1.5">
          {label}
          {animated && <span className="rounded bg-cyan-500/20 px-1 text-[9px] font-semibold text-cyan-300">{param!.keyframes.length}KF</span>}
        </span>
        <span className="flex items-center gap-1">
          {animated && (
            <select value={easing} onChange={e => setEasing(e.target.value as Easing)} title="Easing for keyframes you add" className="h-4 rounded bg-white/5 text-[9px] text-zinc-300 outline-none hover:bg-white/10">
              <option value="linear">Linear</option>
              <option value="ease-in">Ease in</option>
              <option value="ease-out">Ease out</option>
              <option value="ease-in-out">Ease in-out</option>
              <option value="step">Hold</option>
            </select>
          )}
          <button onClick={addKf} title="Add keyframe at playhead" className="grid h-4 w-4 place-items-center rounded bg-white/5 text-[9px] hover:bg-cyan-500/20 hover:text-cyan-300">◆</button>
          {animated && <button onClick={clearKf} title="Clear keyframes" className="grid h-4 w-4 place-items-center rounded bg-white/5 text-[9px] hover:bg-rose-500/20 hover:text-rose-300">×</button>}
          <span className="ml-1 tabular-nums text-zinc-300">{format ? format(sampled) : `${Math.round(sampled)}${suffix ?? ''}`}</span>
        </span>
      </div>
      <input type="range" min={min} max={max} step={step ?? 1} value={sampled} onChange={e => setVal(parseFloat(e.target.value))} className="h-1 w-full" />
      {/* A compact keyframe track: a dot per KF positioned by time fraction. */}
      {animated && (
        <KeyframeTrack param={param!} />
      )}
    </div>
  );
}

/** Tiny read-only KF track — diamonds at each keyframe's time fraction. */
function KeyframeTrack({ param }: { param: AnimatedParam<number> }) {
  const kfs = param.keyframes;
  if (kfs.length < 2) return null;
  const t0 = kfs[0].t, t1 = kfs[kfs.length - 1].t;
  const span = Math.max(1e-6, t1 - t0);
  return (
    <div className="relative mt-0.5 h-2">
      <div className="absolute left-0 right-0 top-1/2 h-px -translate-y-1/2 bg-white/10" />
      {kfs.map((k, i) => (
        <span key={i} title={`${k.t.toFixed(2)}s`} className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 text-[7px] text-cyan-400" style={{ left: `${((k.t - t0) / span) * 100}%` }}>◆</span>
      ))}
    </div>
  );
}
