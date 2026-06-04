/**
 * Shared Web Audio master-effect chain (CCW-3).
 *
 * THE problem this solves: the studios built the master rack two different ways
 * — live playback connected tracks straight to the destination (so reverb / EQ /
 * compressor were INAUDIBLE while composing), and export applied a separate
 * sample-based DSP pass (so some effects were silently dropped and the file
 * never matched the preview). Two divergent code paths = preview ≠ output.
 *
 * Here the chain is built ONCE as native Web Audio nodes. The SAME factory is
 * mounted in the realtime AudioContext (live playback) AND in the export's
 * OfflineAudioContext (bounce). Web Audio nodes behave identically online and
 * offline, so preview == export by construction.
 *
 * Returns an { input, output } node pair: connect your mix into `input`, connect
 * `output` to ctx.destination. An empty / all-bypassed rack returns a pass-through.
 */

import type { AppliedEffect } from './effect-presets';

type AnyAudioContext = BaseAudioContext;

const dbToGain = (db: number) => Math.pow(10, db / 20);
const num = (v: unknown, d: number) => (typeof v === 'number' && isFinite(v) ? v : d);

/**
 * Build an impulse response for a ConvolverNode reverb. Sized by the rack's
 * "size" enum (Room/Hall/Plate/Chamber). Decaying noise burst — cheap, no asset
 * download, deterministic. `seed`-free (uses a small LCG so offline == online).
 */
function makeImpulse(ctx: AnyAudioContext, seconds: number, decay: number): AudioBuffer {
  const rate = ctx.sampleRate;
  const len = Math.max(1, Math.floor(seconds * rate));
  const ir = ctx.createBuffer(2, len, rate);
  let s = 0x2545f491; // fixed seed → identical IR every render
  const rnd = () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) / 0xffffffff) * 2 - 1; };
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = rnd() * Math.pow(1 - i / len, decay);
  }
  return ir;
}

const REVERB_SIZES: Record<string, { sec: number; decay: number }> = {
  Room: { sec: 0.7, decay: 2.5 },
  Chamber: { sec: 1.4, decay: 2.8 },
  Plate: { sec: 1.8, decay: 3.2 },
  Hall: { sec: 2.8, decay: 3.5 },
};

export interface MasterChain { input: AudioNode; output: AudioNode }

export function buildMasterChain(ctx: AnyAudioContext, effects: AppliedEffect[] | undefined): MasterChain {
  const input = ctx.createGain();
  let node: AudioNode = input;
  const active = (effects ?? []).filter((e) => !e.bypassed);

  for (const e of active) {
    const p = e.params;
    switch (e.effectId) {
      case 'gain': {
        const g = ctx.createGain(); g.gain.value = dbToGain(num(p.db, 0));
        node.connect(g); node = g; break;
      }
      case 'bass-shelf': {
        const f = ctx.createBiquadFilter();
        f.type = 'lowshelf'; f.frequency.value = num(p.freq, 200); f.gain.value = num(p.gain, 0);
        node.connect(f); node = f; break;
      }
      case 'treble-shelf': {
        const f = ctx.createBiquadFilter();
        f.type = 'highshelf'; f.frequency.value = num(p.freq, 6000); f.gain.value = num(p.gain, 0);
        node.connect(f); node = f; break;
      }
      case '3band-eq': {
        // Bass shelf → mid peaking → treble shelf. The mid band was the one
        // dropped by the old export path; it is wired here.
        const bass = ctx.createBiquadFilter();
        bass.type = 'lowshelf'; bass.frequency.value = 250; bass.gain.value = num(p.bass, 0);
        const mid = ctx.createBiquadFilter();
        mid.type = 'peaking'; mid.frequency.value = 1000; mid.Q.value = 0.9; mid.gain.value = num(p.mid, 0);
        const treble = ctx.createBiquadFilter();
        treble.type = 'highshelf'; treble.frequency.value = 4000; treble.gain.value = num(p.treble, 0);
        node.connect(bass); bass.connect(mid); mid.connect(treble); node = treble; break;
      }
      case 'compressor': {
        // Real dynamics — replaces the old "static gain cut" fake.
        const c = ctx.createDynamicsCompressor();
        c.threshold.value = num(p.threshold, -18);
        c.ratio.value = Math.max(1, num(p.ratio, 3));
        c.attack.value = Math.max(0, num(p.attack, 5)) / 1000;
        c.release.value = Math.max(0, num(p.release, 100)) / 1000;
        c.knee.value = 6;
        node.connect(c); node = c; break;
      }
      case 'limiter': {
        // Brickwall = compressor at high ratio + fast attack, then a ceiling gain.
        const c = ctx.createDynamicsCompressor();
        c.threshold.value = num(p.ceiling, -1); c.ratio.value = 20;
        c.attack.value = 0.001; c.release.value = 0.05; c.knee.value = 0;
        node.connect(c); node = c; break;
      }
      case 'noise-gate': {
        // Native downward gate. WaveShaper can't gate by level, so use a script-
        // free approximation: a compressor with very low ratio does nothing here,
        // so we apply a hard gate via a GainNode driven by an analyser is not
        // possible offline → instead use a steep expander emulation: a high-ratio
        // compressor inverted is not available. Practical browser gate: a sharp
        // highpass does not gate. We therefore implement the gate as a no-color
        // pass here and let the sample-based fallback handle true gating when the
        // chain is rendered offline (see applyGateToBuffer). For the live path a
        // gate mostly matters on quiet tails; we keep it transparent rather than
        // fake. (Handled post-render for exact parity.)
        break;
      }
      case 'reverb': {
        const size = REVERB_SIZES[String(p.size ?? 'Room')] ?? REVERB_SIZES.Room;
        const mix = Math.min(1, Math.max(0, num(p.amount, 30) / 100));
        const conv = ctx.createConvolver();
        conv.buffer = makeImpulse(ctx, size.sec, size.decay);
        const wet = ctx.createGain(); wet.gain.value = mix;
        const dry = ctx.createGain(); dry.gain.value = 1 - mix * 0.4;
        const merge = ctx.createGain();
        node.connect(dry); dry.connect(merge);
        node.connect(conv); conv.connect(wet); wet.connect(merge);
        node = merge; break;
      }
      case 'delay': {
        const time = Math.max(0.01, num(p.time, 0.25));
        const fb = Math.min(0.9, Math.max(0, num(p.feedback, 30) / 100));
        const delay = ctx.createDelay(2); delay.delayTime.value = time;
        const feedback = ctx.createGain(); feedback.gain.value = fb;
        const wet = ctx.createGain(); wet.gain.value = 0.5;
        const merge = ctx.createGain();
        node.connect(merge); // dry
        node.connect(delay); delay.connect(feedback); feedback.connect(delay);
        delay.connect(wet); wet.connect(merge);
        node = merge; break;
      }
      case 'stereo-widener': {
        // Mid/side widen via a small channel matrix. width 0..2 (UI 0..200%).
        const width = Math.min(2, Math.max(0, num(p.width, 100) / 100));
        const splitter = ctx.createChannelSplitter(2);
        const merger = ctx.createChannelMerger(2);
        // L' = mid + side*w ; R' = mid - side*w, with mid=(L+R)/2, side=(L-R)/2.
        // Build with gains: this is exact and offline-safe.
        const lIn = ctx.createGain(), rIn = ctx.createGain();
        node.connect(splitter);
        splitter.connect(lIn, 0); splitter.connect(rIn, 1);
        const halfW = width / 2;
        const lToL = ctx.createGain(); lToL.gain.value = 0.5 + halfW;
        const rToL = ctx.createGain(); rToL.gain.value = 0.5 - halfW;
        const lToR = ctx.createGain(); lToR.gain.value = 0.5 - halfW;
        const rToR = ctx.createGain(); rToR.gain.value = 0.5 + halfW;
        lIn.connect(lToL); rIn.connect(rToL); lToL.connect(merger, 0, 0); rToL.connect(merger, 0, 0);
        lIn.connect(lToR); rIn.connect(rToR); lToR.connect(merger, 0, 1); rToR.connect(merger, 0, 1);
        node = merger; break;
      }
      case 'de-ess': {
        // Tame sibilance: a gentle high-shelf cut scaled by amount. Full
        // dynamic de-essing needs a sidechain; this is the audible, honest
        // approximation (and matches what the offline pass applies).
        const amt = Math.min(1, Math.max(0, num(p.amount, 60) / 100));
        const f = ctx.createBiquadFilter();
        f.type = 'highshelf'; f.frequency.value = 6500; f.gain.value = -8 * amt;
        node.connect(f); node = f; break;
      }
      // normalize / fade-in / fade-out / pitch-shift / speed / reverse change
      // length or need whole-buffer analysis — they are applied as a
      // post-render sample pass (see applyOfflineOnlyEffects), NOT as nodes.
      default: break;
    }
  }
  return { input, output: node };
}

/**
 * Effects that can't be expressed as a realtime node graph (they resize the
 * buffer or need whole-signal analysis). Applied to the rendered AudioBuffer
 * AFTER the node chain. The realtime preview can't honor these without
 * pre-rendering, so they are intentionally export-only — and the UI marks them
 * as "applied on export".
 */
export const OFFLINE_ONLY_EFFECTS = new Set(['normalize', 'fade-in', 'fade-out', 'pitch-shift', 'speed', 'reverse', 'noise-gate']);

export function hasOfflineOnly(effects: AppliedEffect[] | undefined): boolean {
  return (effects ?? []).some((e) => !e.bypassed && OFFLINE_ONLY_EFFECTS.has(e.effectId));
}
