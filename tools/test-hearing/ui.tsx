'use client';
import * as React from 'react';
import { Play, Square } from 'lucide-react';

export default function HearingTest() {
  const [freq, setFreq] = React.useState(1000);
  const [playing, setPlaying] = React.useState(false);
  const ctxRef = React.useRef<AudioContext | null>(null);
  const oscRef = React.useRef<OscillatorNode | null>(null);
  const gainRef = React.useRef<GainNode | null>(null);

  const stop = React.useCallback(() => {
    try { oscRef.current?.stop(); } catch { /* */ }
    oscRef.current = null; setPlaying(false);
  }, []);
  // Close the AudioContext on unmount. Browsers cap concurrent contexts
  // (~6 on Chrome) and the previous cleanup only stopped the oscillator;
  // navigating between audio tools a handful of times eventually broke
  // playback for the whole tab.
  React.useEffect(() => () => {
    stop();
    try { void ctxRef.current?.close(); } catch { /* */ }
    ctxRef.current = null;
  }, [stop]);

  const start = () => {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const c = ctxRef.current ?? (ctxRef.current = new AC());
    const osc = c.createOscillator(); osc.type = 'sine'; osc.frequency.value = freq;
    const g = c.createGain(); g.gain.value = 0.15;
    osc.connect(g).connect(c.destination); osc.start();
    oscRef.current = osc; gainRef.current = g; setPlaying(true);
  };

  const update = (f: number) => { setFreq(f); if (oscRef.current && ctxRef.current) oscRef.current.frequency.setValueAtTime(f, ctxRef.current.currentTime); };

  const note = freq < 20 ? 'infrasound' : freq <= 60 ? 'deep bass' : freq <= 250 ? 'bass' : freq <= 2000 ? 'midrange' : freq <= 6000 ? 'presence' : freq <= 12000 ? 'brilliance' : freq <= 16000 ? 'most adults lose this' : 'teens/very young only';

  return (
    <div className="space-y-5">
      <div className="text-center">
        <div className="text-[44px] font-extrabold tabular-nums tracking-tight text-[var(--color-cat-test)]">{freq.toLocaleString()} Hz</div>
        <div className="text-[12px] text-[var(--color-fg-muted)]">{note}</div>
      </div>
      <input type="range" min={20} max={20000} step={10} value={freq} onChange={(e) => update(+e.target.value)} className="w-full" />
      <div className="flex justify-between text-[10px] text-[var(--color-fg-subtle)]"><span>20 Hz</span><span>1 kHz</span><span>10 kHz</span><span>20 kHz</span></div>
      <div className="flex items-center gap-2">
        {!playing ? (
          <button type="button" onClick={start} className="flex items-center gap-2 bg-[var(--color-cat-test)] px-4 py-2.5 text-[12px] font-bold uppercase tracking-wider text-white"><Play className="h-3.5 w-3.5" /> Play tone</button>
        ) : (
          <button type="button" onClick={stop} className="flex items-center gap-2 border border-black/[0.12] px-4 py-2.5 text-[12px] font-bold uppercase tracking-wider"><Square className="h-3.5 w-3.5" /> Stop</button>
        )}
        {[60, 1000, 8000, 15000, 18000].map((f) => (
          <button key={f} type="button" onClick={() => update(f)} className="border border-black/[0.12] px-2.5 py-1.5 text-[11px] font-semibold hover:bg-[var(--color-surface-2)]">{f >= 1000 ? `${f / 1000}k` : f}</button>
        ))}
      </div>
      <p className="text-[11px] text-[var(--color-fg-subtle)]">Keep the volume moderate. Drag the slider up until the tone fades to silence — that’s the top of your hearing range. (Healthy young ears reach ~17–20 kHz; it drops with age.)</p>
    </div>
  );
}
