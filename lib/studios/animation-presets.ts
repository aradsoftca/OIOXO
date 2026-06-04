export type AnimationKind = 'entrance' | 'emphasis' | 'exit';

export type AnimationStyle =
  | 'fade'
  | 'slide-in-up' | 'slide-in-down' | 'slide-in-left' | 'slide-in-right'
  | 'slide-out-up' | 'slide-out-down' | 'slide-out-left' | 'slide-out-right'
  | 'zoom-in' | 'zoom-out'
  | 'fly-in' | 'fly-out'
  | 'pulse' | 'spin' | 'bounce' | 'shake' | 'flash'
  | 'wipe-in' | 'wipe-out'
  | 'fade-up' | 'fade-down'
  | 'rotate-in' | 'rotate-out';

export type EasingFn = 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out' | 'bounce-out' | 'elastic-out';

export interface ElementAnimation {
  style: AnimationStyle;
  duration: number;
  delay: number;
  easing: EasingFn;
  repeat?: number;
  intensity?: number;
}

export interface AnimationsCatalogEntry {
  style: AnimationStyle;
  label: string;
  kind: AnimationKind | 'any';
  description: string;
  preview: string;
}

export const ANIMATION_CATALOG: AnimationsCatalogEntry[] = [
  { style: 'fade',           label: 'Fade In',      kind: 'entrance', description: 'Smooth opacity 0 → 1', preview: '○→●' },
  { style: 'slide-in-up',    label: 'Slide Up',     kind: 'entrance', description: 'Enters from below', preview: '↑' },
  { style: 'slide-in-down',  label: 'Slide Down',   kind: 'entrance', description: 'Enters from above', preview: '↓' },
  { style: 'slide-in-left',  label: 'Slide Left',   kind: 'entrance', description: 'Enters from right', preview: '←' },
  { style: 'slide-in-right', label: 'Slide Right',  kind: 'entrance', description: 'Enters from left', preview: '→' },
  { style: 'zoom-in',        label: 'Zoom In',      kind: 'entrance', description: 'Grows from nothing', preview: '○●' },
  { style: 'fly-in',         label: 'Fly In',       kind: 'entrance', description: 'Drops in with bounce', preview: '⤓' },
  { style: 'wipe-in',        label: 'Wipe In',      kind: 'entrance', description: 'Reveals left to right', preview: '▶' },
  { style: 'fade-up',        label: 'Fade Up',      kind: 'entrance', description: 'Fade in while rising', preview: '⬆⊙' },
  { style: 'fade-down',      label: 'Fade Down',    kind: 'entrance', description: 'Fade in while dropping', preview: '⬇⊙' },
  { style: 'rotate-in',      label: 'Rotate In',    kind: 'entrance', description: 'Spins in', preview: '↻' },
  { style: 'pulse',          label: 'Pulse',        kind: 'emphasis', description: 'Brief scale-up bounce', preview: '◉' },
  { style: 'flash',          label: 'Flash',        kind: 'emphasis', description: 'Quick opacity blink', preview: '✦' },
  { style: 'shake',          label: 'Shake',        kind: 'emphasis', description: 'Side-to-side wiggle', preview: '↔' },
  { style: 'spin',           label: 'Spin',         kind: 'emphasis', description: 'Full rotation', preview: '↻' },
  { style: 'bounce',         label: 'Bounce',       kind: 'emphasis', description: 'Vertical hop', preview: '↟' },
  { style: 'slide-out-up',   label: 'Slide Up Out',    kind: 'exit',    description: 'Exits upward', preview: '↑✕' },
  { style: 'slide-out-down', label: 'Slide Down Out',  kind: 'exit',    description: 'Exits downward', preview: '↓✕' },
  { style: 'slide-out-left', label: 'Slide Left Out',  kind: 'exit',    description: 'Exits left', preview: '←✕' },
  { style: 'slide-out-right',label: 'Slide Right Out', kind: 'exit',    description: 'Exits right', preview: '→✕' },
  { style: 'zoom-out',       label: 'Zoom Out',     kind: 'exit',     description: 'Shrinks to nothing', preview: '●○' },
  { style: 'fly-out',        label: 'Fly Out',      kind: 'exit',     description: 'Rises off-screen', preview: '⤒' },
  { style: 'wipe-out',       label: 'Wipe Out',     kind: 'exit',     description: 'Reveals right to left', preview: '◀' },
  { style: 'rotate-out',     label: 'Rotate Out',   kind: 'exit',     description: 'Spins out', preview: '↺' },
];

export function defaultAnimation(style: AnimationStyle, kind: AnimationKind): ElementAnimation {
  const isEmphasis = kind === 'emphasis';
  return {
    style,
    duration: isEmphasis ? 0.6 : 0.5,
    delay: 0,
    easing: isEmphasis ? 'ease-in-out' : kind === 'exit' ? 'ease-in' : 'ease-out',
    repeat: isEmphasis ? 1 : undefined,
    intensity: 1,
  };
}

const EASING_FNS: Record<EasingFn, (t: number) => number> = {
  'linear':       t => t,
  'ease-in':      t => t * t,
  'ease-out':     t => 1 - (1 - t) * (1 - t),
  'ease-in-out':  t => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2,
  'bounce-out':   t => {
    const n1 = 7.5625, d1 = 2.75;
    if (t < 1 / d1) return n1 * t * t;
    if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
    if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
    return n1 * (t -= 2.625 / d1) * t + 0.984375;
  },
  'elastic-out':  t => t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * (2 * Math.PI) / 3) + 1,
};

export interface AnimationState {
  opacity: number;
  translateX: number;
  translateY: number;
  scale: number;
  rotate: number;
}

export const IDENTITY: AnimationState = { opacity: 1, translateX: 0, translateY: 0, scale: 1, rotate: 0 };

export function applyAnimation(anim: ElementAnimation, t: number, frame: { w: number; h: number }): AnimationState {
  const dur = Math.max(0.01, anim.duration);
  const phase = (t - anim.delay) / dur;
  if (phase <= 0) {
    return initialStateFor(anim, frame);
  }
  if (phase >= 1) {
    return finalStateFor(anim, frame);
  }
  const eased = EASING_FNS[anim.easing](phase);
  return interpolate(anim, eased, frame, phase);
}

function initialStateFor(anim: ElementAnimation, frame: { w: number; h: number }): AnimationState {
  const s = { ...IDENTITY };
  const isEntrance = anim.style.startsWith('slide-in') || anim.style.startsWith('zoom-in') || anim.style.startsWith('fly-in') || anim.style.startsWith('wipe-in') || anim.style === 'fade' || anim.style === 'rotate-in' || anim.style.startsWith('fade-');
  if (isEntrance) {
    s.opacity = 0;
    if (anim.style === 'slide-in-up')    s.translateY = frame.h * 0.4;
    if (anim.style === 'slide-in-down')  s.translateY = -frame.h * 0.4;
    if (anim.style === 'slide-in-left')  s.translateX = frame.w * 0.4;
    if (anim.style === 'slide-in-right') s.translateX = -frame.w * 0.4;
    if (anim.style === 'zoom-in')        s.scale = 0.3;
    if (anim.style === 'fly-in')         { s.translateY = -frame.h * 0.5; s.scale = 1.2; }
    if (anim.style === 'rotate-in')      s.rotate = -180;
    if (anim.style === 'fade-up')        s.translateY = 30;
    if (anim.style === 'fade-down')      s.translateY = -30;
  }
  return s;
}

function finalStateFor(anim: ElementAnimation, frame: { w: number; h: number }): AnimationState {
  const s = { ...IDENTITY };
  const isExit = anim.style.startsWith('slide-out') || anim.style === 'zoom-out' || anim.style === 'fly-out' || anim.style === 'wipe-out' || anim.style === 'rotate-out';
  if (isExit) {
    s.opacity = 0;
    if (anim.style === 'slide-out-up')    s.translateY = -frame.h * 0.4;
    if (anim.style === 'slide-out-down')  s.translateY = frame.h * 0.4;
    if (anim.style === 'slide-out-left')  s.translateX = -frame.w * 0.4;
    if (anim.style === 'slide-out-right') s.translateX = frame.w * 0.4;
    if (anim.style === 'zoom-out')        s.scale = 0.2;
    if (anim.style === 'fly-out')         { s.translateY = -frame.h * 0.6; s.scale = 1.2; }
    if (anim.style === 'rotate-out')      s.rotate = 180;
  }
  return s;
}

function interpolate(anim: ElementAnimation, t: number, frame: { w: number; h: number }, rawPhase: number): AnimationState {
  const from = initialStateFor(anim, frame);
  const to = finalStateFor(anim, frame);
  if (anim.style === 'pulse') {
    const intensity = anim.intensity ?? 1;
    const cycle = Math.sin(rawPhase * Math.PI);
    return { ...IDENTITY, scale: 1 + 0.15 * intensity * cycle };
  }
  if (anim.style === 'flash') {
    const cycle = Math.abs(Math.sin(rawPhase * Math.PI * 3));
    return { ...IDENTITY, opacity: cycle };
  }
  if (anim.style === 'shake') {
    const intensity = anim.intensity ?? 1;
    return { ...IDENTITY, translateX: 10 * intensity * Math.sin(rawPhase * Math.PI * 6) };
  }
  if (anim.style === 'bounce') {
    const intensity = anim.intensity ?? 1;
    return { ...IDENTITY, translateY: -30 * intensity * Math.abs(Math.sin(rawPhase * Math.PI * 2)) };
  }
  if (anim.style === 'spin') {
    return { ...IDENTITY, rotate: 360 * rawPhase };
  }
  return {
    opacity: from.opacity + (1 - from.opacity) * t,
    translateX: from.translateX + (to.translateX - from.translateX) * t * (isExit(anim.style) ? 1 : t === 1 ? 0 : 1) + (isExit(anim.style) ? 0 : -from.translateX * t),
    translateY: from.translateY + (to.translateY - from.translateY) * t * (isExit(anim.style) ? 1 : t === 1 ? 0 : 1) + (isExit(anim.style) ? 0 : -from.translateY * t),
    scale: from.scale + (1 - from.scale) * t + (isExit(anim.style) ? (to.scale - 1) * t : 0),
    rotate: from.rotate + (to.rotate - from.rotate) * t + (isExit(anim.style) ? 0 : -from.rotate * t),
  };
}

function isExit(s: AnimationStyle): boolean {
  return s.startsWith('slide-out') || s === 'zoom-out' || s === 'fly-out' || s === 'wipe-out' || s === 'rotate-out';
}

export function computeElementState(
  animations: { entrance?: ElementAnimation; emphasis?: ElementAnimation; exit?: ElementAnimation } | undefined,
  slideTime: number,
  slideDuration: number,
  frame: { w: number; h: number },
): AnimationState {
  if (!animations) return IDENTITY;
  if (animations.entrance) {
    const e = animations.entrance;
    if (slideTime < e.delay + e.duration) return applyAnimation(e, slideTime, frame);
  }
  if (animations.exit) {
    const ex = animations.exit;
    const exitStart = slideDuration - ex.delay - ex.duration;
    if (slideTime >= exitStart) return applyAnimation(ex, slideTime - exitStart, frame);
  }
  if (animations.emphasis) {
    const em = animations.emphasis;
    const emStart = (animations.entrance ? animations.entrance.delay + animations.entrance.duration + 0.5 : 0.5);
    const localT = slideTime - emStart;
    if (localT >= 0 && localT < em.duration * (em.repeat ?? 1)) {
      return applyAnimation(em, localT % em.duration, frame);
    }
  }
  return IDENTITY;
}

export function toCssTransform(state: AnimationState): string {
  return `translate(${state.translateX}px, ${state.translateY}px) scale(${state.scale}) rotate(${state.rotate}deg)`;
}
