export interface Keyframe<T = number> {
  t: number;
  value: T;
  easing?: 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out' | 'step';
}

export interface AnimatedParam<T = number> {
  defaultValue: T;
  keyframes: Keyframe<T>[];
}

function easingFn(name: NonNullable<Keyframe['easing']>): (t: number) => number {
  switch (name) {
    case 'ease-in':     return t => t * t;
    case 'ease-out':    return t => 1 - (1 - t) * (1 - t);
    case 'ease-in-out': return t => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    case 'step':        return t => t < 1 ? 0 : 1;
    case 'linear':
    default:            return t => t;
  }
}

export function sampleAnimated(param: AnimatedParam<number>, time: number): number {
  const kf = param.keyframes;
  if (!kf.length) return param.defaultValue;
  if (time <= kf[0].t) return kf[0].value;
  if (time >= kf[kf.length - 1].t) return kf[kf.length - 1].value;
  for (let i = 0; i < kf.length - 1; i++) {
    const a = kf[i], b = kf[i + 1];
    if (time >= a.t && time <= b.t) {
      const span = b.t - a.t;
      if (span === 0) return b.value;
      const tNorm = (time - a.t) / span;
      const eased = easingFn(a.easing ?? 'linear')(tNorm);
      return a.value + (b.value - a.value) * eased;
    }
  }
  return param.defaultValue;
}

export function addKeyframe(param: AnimatedParam<number>, time: number, value: number, easing?: Keyframe['easing']): AnimatedParam<number> {
  const kf: Keyframe<number> = { t: time, value, easing };
  const without = param.keyframes.filter(k => Math.abs(k.t - time) > 0.001);
  return { defaultValue: param.defaultValue, keyframes: [...without, kf].sort((a, b) => a.t - b.t) };
}

export function removeKeyframe(param: AnimatedParam<number>, time: number): AnimatedParam<number> {
  return { defaultValue: param.defaultValue, keyframes: param.keyframes.filter(k => Math.abs(k.t - time) > 0.001) };
}

export const makeStatic = <T>(value: T): AnimatedParam<T> => ({ defaultValue: value, keyframes: [] });

export function isAnimated<T>(p: AnimatedParam<T>): boolean { return p.keyframes.length > 1; }
