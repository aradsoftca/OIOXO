/**
 * Lightweight on-device audio level / speaking detection over the Web Audio API.
 *
 * Used by the green-room mic test (an animated input meter that bounces to your
 * voice) AND by in-call active-speaker detection (glow + auto-promote whoever is
 * talking). Pure analyser maths — no recording, nothing leaves the device.
 *
 * One shared AudioContext is reused across every meter so a call with N remote
 * streams does not spin up N hardware audio graphs (browsers cap ~6 contexts).
 */

let sharedCtx: AudioContext | null = null;

function ctx(): AudioContext {
  if (!sharedCtx || sharedCtx.state === 'closed') {
    const AC: typeof AudioContext =
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext ?? AudioContext;
    sharedCtx = new AC();
  }
  // Autoplay policy can leave the context suspended until a user gesture; the
  // call already had a click (Start), so resume is safe and silent if denied.
  if (sharedCtx.state === 'suspended') void sharedCtx.resume().catch(() => {});
  return sharedCtx;
}

export interface AudioMeter {
  /** 0..1 smoothed RMS level (use for a meter bar). */
  level: () => number;
  /** True when the level has been over the speaking threshold recently. */
  speaking: () => boolean;
  stop: () => void;
}

/**
 * Attach an RMS meter to the audio tracks of a stream. The returned `level()`
 * and `speaking()` are cheap to poll from a requestAnimationFrame loop; the
 * heavy work (FFT) is done lazily inside them, only when you read.
 */
export function meterStream(stream: MediaStream): AudioMeter {
  const audioTracks = stream.getAudioTracks();
  if (audioTracks.length === 0) {
    return { level: () => 0, speaking: () => false, stop: () => {} };
  }
  const ac = ctx();
  const src = ac.createMediaStreamSource(new MediaStream(audioTracks));
  const analyser = ac.createAnalyser();
  analyser.fftSize = 512;
  analyser.smoothingTimeConstant = 0.6;
  src.connect(analyser);
  const buf = new Uint8Array(analyser.fftSize);

  let smoothed = 0;
  let speakingUntil = 0;
  let stopped = false;

  const sample = (): number => {
    if (stopped) return 0;
    analyser.getByteTimeDomainData(buf);
    let sum = 0;
    for (let i = 0; i < buf.length; i++) {
      const v = (buf[i] - 128) / 128;
      sum += v * v;
    }
    const rms = Math.sqrt(sum / buf.length); // 0..~1
    // Light attack, slow release so the bar feels alive but does not flicker.
    smoothed = rms > smoothed ? rms * 0.6 + smoothed * 0.4 : rms * 0.2 + smoothed * 0.8;
    // ~0.045 RMS reliably clears typical mic noise floors without clipping
    // quiet speakers. Hold the "speaking" flag for 350ms so brief pauses
    // between words do not strobe the active-speaker ring.
    if (smoothed > 0.045) speakingUntil = performance.now() + 350;
    return Math.min(1, smoothed * 2.2);
  };

  return {
    level: () => sample(),
    speaking: () => {
      sample();
      return performance.now() < speakingUntil;
    },
    stop: () => {
      if (stopped) return;
      stopped = true;
      try { src.disconnect(); } catch { /* */ }
      try { analyser.disconnect(); } catch { /* */ }
    },
  };
}
