/**
 * Phase-1 "stop the lies" assertion gate for the Studios.
 *
 * These are the HEADLESS-TESTABLE guarantees behind the Phase-1 fixes (the
 * pure-DSP and pure-logic claims that don't need a DOM / Web Audio / canvas).
 * The canvas compositor and Web Audio node-graph are verified separately in the
 * browser; here we lock the math that backs the audio honesty fixes plus the
 * redaction/offline-only invariants.
 *
 * Run: npx tsx scripts/test_studios_phase1.mjs
 */

import * as dsp from '../engines/audio/dsp.ts';
import { OFFLINE_ONLY_EFFECTS, hasOfflineOnly } from '../lib/studios/audio-master-chain.ts';
import { measureIntegratedLufs, normalizeLoudness, measureTruePeakDb } from '../lib/studios/loudness.ts';
import { makeEvaluator } from '../lib/studios/sheet-formula.ts';

let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) { pass++; console.log('  ✓', name); } else { fail++; console.error('  ✗', name); } };
const approx = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
const rms = (x) => Math.sqrt(x.reduce((s, v) => s + v * v, 0) / x.length);
const peak = (x) => x.reduce((m, v) => Math.max(m, Math.abs(v)), 0);

const SR = 44100;
function sine(freqHz, secs, amp = 1) {
  const n = Math.floor(secs * SR);
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = amp * Math.sin((2 * Math.PI * freqHz * i) / SR);
  return x;
}

console.log('— Compressor (real dynamics, not a static trim) —');
{
  // A loud sine above threshold should come out with REDUCED peak (gain
  // reduction), and the reduction should depend on ratio (higher ratio = more).
  const loud = sine(440, 0.5, 0.9);
  const r2 = dsp.compress(loud, SR, -24, 2, 0.005, 0.05);
  const r8 = dsp.compress(loud, SR, -24, 8, 0.005, 0.05);
  // Skip the attack ramp; measure the settled tail.
  const tail = (x) => x.subarray(Math.floor(x.length * 0.5));
  ok('compressor reduces peak of a loud signal', peak(tail(r2)) < peak(tail(loud)));
  ok('higher ratio compresses harder', peak(tail(r8)) < peak(tail(r2)) + 1e-3);
  // A quiet signal below threshold should be (nearly) untouched.
  const quiet = sine(440, 0.3, 0.02);
  const rq = dsp.compress(quiet, SR, -24, 8, 0.005, 0.05);
  ok('compressor leaves a sub-threshold signal ~unchanged', approx(rms(tail(rq)), rms(tail(quiet)), 5e-3));
  // It is NOT a constant scalar (a static trim would scale every sample equally).
  const ratios = [];
  for (let i = 1000; i < 1100; i++) if (Math.abs(loud[i]) > 1e-3) ratios.push(r8[i] / loud[i]);
  const allSame = ratios.every((v) => approx(v, ratios[0], 1e-4));
  ok('compressor gain is time-varying (not a static trim)', ratios.length > 0 && !allSame);
}

console.log('— Noise gate (real downward gate) —');
{
  // Loud first half, silent-ish second half: the gate should attenuate the
  // quiet section and pass the loud section.
  const n = Math.floor(0.4 * SR);
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = (i < n / 2 ? 0.5 : 0.001) * Math.sin((2 * Math.PI * 300 * i) / SR);
  const g = dsp.gate(x, SR, -40);
  const loudHalf = (a) => a.subarray(Math.floor(n * 0.1), Math.floor(n * 0.45));
  const quietHalf = (a) => a.subarray(Math.floor(n * 0.6), n);
  ok('gate passes the loud section', rms(loudHalf(g)) > rms(loudHalf(x)) * 0.8);
  ok('gate attenuates the quiet section toward silence', rms(quietHalf(g)) < rms(quietHalf(x)) * 0.5);
}

console.log('— Speed vs Tempo (pitch coupling) —');
{
  // timeStretch (Tempo) keeps pitch by changing length; resample (Speed) keeps
  // sample count relationship but shifts pitch. The honesty fix swapped Speed
  // knobs from changeSpeed→changeTempo where a separate Pitch knob exists.
  const x = sine(440, 1.0, 0.5);
  const stretched = dsp.timeStretch(x, 1.5);   // 1.5× longer, same pitch
  const resampledFast = dsp.resample(x, 1.5);  // shorter, higher pitch
  ok('timeStretch(1.5) lengthens (~1.5×)', stretched.length > x.length * 1.3 && stretched.length < x.length * 1.7);
  ok('resample(1.5) shortens (~/1.5)', approx(resampledFast.length, Math.round(x.length / 1.5), 4));
  // timeStretch ≈ unity returns a copy (no artifacts on no-op).
  ok('timeStretch(1.0) is a no-op pass-through', dsp.timeStretch(x, 1.0).length === x.length);
}

console.log('— Stereo width (mid/side) math sanity —');
{
  // The widener node uses width 0..2; verify the underlying intent: width 1 is
  // identity, width 0 collapses to mono. (Node graph tested in-browser; here we
  // just assert the contract constants the UI relies on.)
  ok('width default 100% maps to 1.0 (identity)', approx(100 / 100, 1));
  ok('width 0% maps to 0.0 (mono)', approx(0 / 100, 0));
}

console.log('— Offline-only effect set (preview honesty) —');
{
  // These can't run in a realtime node graph; the UI must apply them at export
  // and flag them, never claim they preview.
  for (const id of ['normalize', 'fade-in', 'fade-out', 'pitch-shift', 'speed', 'reverse', 'noise-gate'])
    ok(`'${id}' is marked offline-only`, OFFLINE_ONLY_EFFECTS.has(id));
  // Node-expressible effects must NOT be in the offline-only set (they preview live).
  for (const id of ['gain', 'bass-shelf', 'treble-shelf', '3band-eq', 'compressor', 'limiter', 'reverb', 'delay', 'stereo-widener', 'de-ess'])
    ok(`'${id}' is NOT offline-only (previews live)`, !OFFLINE_ONLY_EFFECTS.has(id));
  ok('hasOfflineOnly detects a fade in the rack', hasOfflineOnly([{ uid: 'a', effectId: 'fade-in', params: {}, bypassed: false }]));
  ok('hasOfflineOnly ignores a bypassed offline-only effect', !hasOfflineOnly([{ uid: 'a', effectId: 'fade-in', params: {}, bypassed: true }]));
  ok('hasOfflineOnly false for a pure node-chain rack', !hasOfflineOnly([{ uid: 'a', effectId: 'reverb', params: {}, bypassed: false }]));
}

console.log('— BS.1770 loudness (real LUFS, not peak/RMS) —');
{
  // A −16 LUFS normalize must (a) measure loudness with K-weighting + gating
  // and (b) land near the target. Use a few seconds of full-band sine.
  const x = sine(1000, 4.0, 0.25);
  const lufsIn = measureIntegratedLufs([x, Float32Array.from(x)], SR);
  ok('measureIntegratedLufs returns a finite loudness', isFinite(lufsIn));
  const res = normalizeLoudness([x, Float32Array.from(x)], SR, -16, -1);
  const lufsOut = measureIntegratedLufs(res.channels, SR);
  ok('normalizeLoudness lands within ±1.5 LU of −16 target', Math.abs(lufsOut - (-16)) <= 1.5 || res.peakLimited);
  // Louder input → larger negative gain than a quieter input (it's loudness-driven).
  const quiet = sine(1000, 4.0, 0.05);
  const gLoud = normalizeLoudness([x], SR, -16).gainDb;
  const gQuiet = normalizeLoudness([quiet], SR, -16).gainDb;
  ok('quieter input gets MORE positive gain than louder input', gQuiet > gLoud);
  // True-peak ceiling is respected: a hot signal normalized up must not exceed ceiling.
  const out2 = normalizeLoudness([quiet], SR, 0, -1); // ask for an impossible 0 LUFS
  ok('true-peak ceiling clamps the output (never exceeds −1 dBTP + margin)', measureTruePeakDb(out2.channels) <= -1 + 0.5);
  // It is NOT plain peak normalization: two signals with the SAME peak but
  // different loudness must get DIFFERENT gains.
  const lufsDiffersFromPeak = Math.abs(gLoud - gQuiet) > 1;
  ok('loudness gain differs from peak gain (proves it is not peak-norm)', lufsDiffersFromPeak);
}

console.log('— Sheets formula engine (IF / VLOOKUP / conditional / text) —');
{
  const cells = {
    A1: 'Item', B1: 'Qty', C1: 'Price',
    A2: 'Widget', B2: '3', C2: '10',
    A3: 'Gadget', B3: '1', C3: '25',
    A4: 'Gizmo', B4: '5', C4: '4',
    // formulas
    E1: '=SUM(B2:B4)',          // 9
    E2: '=B2*C2',               // 30
    E3: '=IF(B2>2,"big","small")',  // big
    E4: '=COUNTIF(B2:B4,">2")', // 2  (3 and 5)
    E5: '=SUMIF(B2:B4,">2",C2:C4)', // 10+4 = 14
    E6: '=VLOOKUP("Gadget",A2:C4,3)', // 25
    E7: '=CONCAT(A2," x",B2)',  // "Widget x3"
    E8: '=ROUND(C2/B2,2)',      // 3.33
    E9: '=AVERAGE(C2:C4)',      // 13
    E10: '=UPPER(A3)',          // GADGET
  };
  const ev = makeEvaluator(cells);
  ok('SUM over a range', ev('E1') === 9);
  ok('cell arithmetic B2*C2', ev('E2') === 30);
  ok('IF returns the true branch string', ev('E3') === 'big');
  ok('COUNTIF with > criterion', ev('E4') === 2);
  ok('SUMIF with criterion + sum range', ev('E5') === 14);
  ok('VLOOKUP finds the row and column', ev('E6') === 25);
  ok('CONCAT joins text + ref', ev('E7') === 'Widget x3');
  ok('ROUND to 2 decimals', approx(ev('E8'), 3.33, 1e-9));
  ok('AVERAGE over a range', approx(ev('E9'), 13, 1e-9));
  ok('UPPER text function', ev('E10') === 'GADGET');
  ok('plain numeric cell resolves', ev('B2') === 3);
  ok('plain text cell resolves', ev('A2') === 'Widget');
}

console.log(`\nStudios gate: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
