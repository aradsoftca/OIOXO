'use client';
import * as React from 'react';
import { Volume2 } from 'lucide-react';

export default function SpeakerTest() {
  const ctxRef = React.useRef<AudioContext | null>(null);
  const [active, setActive] = React.useState('');

  const ctx = () => {
    if (!ctxRef.current) { const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext; ctxRef.current = new AC(); }
    return ctxRef.current!;
  };

  // Close the AudioContext on unmount. Without this, every visit to the
  // speaker test left a context behind — the ~6-context cap exhausts after
  // a handful of navigations and breaks audio for the whole tab.
  React.useEffect(() => () => {
    try { void ctxRef.current?.close(); } catch { /* */ }
    ctxRef.current = null;
  }, []);

  const playPan = (pan: number, label: string) => {
    const c = ctx(); const t = c.currentTime;
    const osc = c.createOscillator(); osc.frequency.value = 440; osc.type = 'sine';
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.3, t + 0.05); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.0);
    const p = c.createStereoPanner(); p.pan.value = pan;
    osc.connect(g).connect(p).connect(c.destination);
    osc.start(t); osc.stop(t + 1.05);
    setActive(label); setTimeout(() => setActive((a) => a === label ? '' : a), 1100);
  };

  const sweep = () => {
    const c = ctx(); const t = c.currentTime;
    const osc = c.createOscillator(); osc.type = 'sine';
    osc.frequency.setValueAtTime(80, t); osc.frequency.exponentialRampToValueAtTime(12000, t + 4);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.25, t + 0.1); g.gain.exponentialRampToValueAtTime(0.0001, t + 4);
    osc.connect(g).connect(c.destination); osc.start(t); osc.stop(t + 4.1);
    setActive('Sweep'); setTimeout(() => setActive((a) => a === 'Sweep' ? '' : a), 4200);
  };

  const Btn = ({ label, onClick }: { label: string; onClick: () => void }) => (
    <button type="button" onClick={onClick} className={`flex flex-col items-center gap-2 border px-4 py-6 text-[13px] font-semibold transition ${active === label ? 'border-[var(--color-cat-test)] bg-[var(--color-cat-test)]/10' : 'border-black/[0.12] hover:bg-[var(--color-surface-2)]'}`}>
      <Volume2 className="h-5 w-5" /> {label}
    </button>
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Btn label="Left" onClick={() => playPan(-1, 'Left')} />
        <Btn label="Both" onClick={() => playPan(0, 'Both')} />
        <Btn label="Right" onClick={() => playPan(1, 'Right')} />
        <Btn label="Sweep" onClick={sweep} />
      </div>
      <p className="text-[12px] text-[var(--color-fg-muted)]">Each plays a 440 Hz tone in the chosen channel. You should hear <strong>Left</strong> only on the left side and <strong>Right</strong> only on the right — if they’re swapped, your channels are reversed.</p>
    </div>
  );
}
