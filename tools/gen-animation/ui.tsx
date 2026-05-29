'use client';
import * as React from 'react';
import { Copy, Check, RotateCcw } from 'lucide-react';

interface Preset {
  id: string;
  label: string;
  keyframes: string;
  duration: number;
  easing: string;
  iteration: string;
}

const PRESETS: Preset[] = [
  { id: 'fade-in', label: 'Fade In', duration: 0.6, easing: 'ease-out', iteration: '1',
    keyframes: '0% { opacity: 0 } 100% { opacity: 1 }' },
  { id: 'slide-up', label: 'Slide Up', duration: 0.5, easing: 'ease-out', iteration: '1',
    keyframes: '0% { transform: translateY(40px); opacity: 0 } 100% { transform: translateY(0); opacity: 1 }' },
  { id: 'scale-in', label: 'Scale In', duration: 0.4, easing: 'cubic-bezier(.34,1.56,.64,1)', iteration: '1',
    keyframes: '0% { transform: scale(.5); opacity: 0 } 100% { transform: scale(1); opacity: 1 }' },
  { id: 'bounce', label: 'Bounce', duration: 1, easing: 'ease', iteration: 'infinite',
    keyframes: '0%,100% { transform: translateY(0) } 50% { transform: translateY(-30px) }' },
  { id: 'shake', label: 'Shake', duration: 0.6, easing: 'ease', iteration: 'infinite',
    keyframes: '0%,100% { transform: translateX(0) } 25% { transform: translateX(-10px) } 75% { transform: translateX(10px) }' },
  { id: 'spin', label: 'Spin', duration: 2, easing: 'linear', iteration: 'infinite',
    keyframes: '0% { transform: rotate(0deg) } 100% { transform: rotate(360deg) }' },
  { id: 'pulse', label: 'Pulse', duration: 1.5, easing: 'ease-in-out', iteration: 'infinite',
    keyframes: '0%,100% { transform: scale(1); opacity: 1 } 50% { transform: scale(1.1); opacity: .7 }' },
  { id: 'flip', label: 'Flip', duration: 0.8, easing: 'ease-in-out', iteration: 'infinite',
    keyframes: '0% { transform: perspective(400px) rotateY(0) } 100% { transform: perspective(400px) rotateY(360deg) }' },
];

const EASINGS = ['linear', 'ease', 'ease-in', 'ease-out', 'ease-in-out', 'cubic-bezier(.34,1.56,.64,1)', 'cubic-bezier(.4,0,.2,1)'];

export default function Tool() {
  const [preset, setPreset] = React.useState(PRESETS[0]);
  const [duration, setDuration] = React.useState(preset.duration);
  const [easing, setEasing] = React.useState(preset.easing);
  const [iteration, setIteration] = React.useState(preset.iteration);
  const [delay, setDelay] = React.useState(0);
  const [keyframes, setKeyframes] = React.useState(preset.keyframes);
  const [name, setName] = React.useState('myAnim');
  const [version, setVersion] = React.useState(0);
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    setDuration(preset.duration);
    setEasing(preset.easing);
    setIteration(preset.iteration);
    setKeyframes(preset.keyframes);
    setName(preset.id.replace(/-/g, ''));
  }, [preset]);

  const fullCss = `@keyframes ${name} {
  ${keyframes}
}

.element {
  animation: ${name} ${duration}s ${easing} ${delay}s ${iteration};
}`;

  const copy = async () => {
    try {
      await navigator.clipboard?.writeText(fullCss);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch { /* iframe / permission denied */ }
  };

  const replay = () => setVersion((v) => v + 1);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="flex flex-col gap-3">
          <div className="border border-black/[0.08] bg-[var(--color-surface-1)] flex items-center justify-center min-h-[320px] overflow-hidden">
            <style>{`@keyframes preview_${version} { ${keyframes} }`}</style>
            <div key={version} className="w-20 h-20 bg-[var(--color-cat-gen)]"
              style={{ animation: `preview_${version} ${duration}s ${easing} ${delay}s ${iteration}` }} />
          </div>
          <button type="button" onClick={replay}
            className="inline-flex items-center justify-center gap-2 border border-black/[0.08] py-2 text-[11px] font-bold uppercase tracking-wider hover:border-[var(--color-cat-gen)]">
            <RotateCcw className="h-3.5 w-3.5" /> Replay
          </button>
          <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-3 font-mono text-[11px] whitespace-pre-wrap">{fullCss}</div>
          <button type="button" onClick={copy}
            className="inline-flex items-center justify-center gap-2 bg-[var(--color-fg)] text-[var(--color-canvas)] py-2.5 text-[12px] font-bold uppercase tracking-wider">
            {copied ? <><Check className="h-4 w-4" /> Copied</> : <><Copy className="h-4 w-4" /> Copy CSS</>}
          </button>
        </div>

        <aside className="space-y-3">
          <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-3">
            <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)] mb-2">Preset</div>
            <div className="grid grid-cols-2 gap-1.5">
              {PRESETS.map((p) => (
                <button key={p.id} type="button" onClick={() => setPreset(p)}
                  className={`border py-2 text-[11px] font-bold transition ${preset.id === p.id ? 'border-[var(--color-cat-gen)] bg-[var(--color-cat-gen)] text-white' : 'border-black/[0.08] text-[var(--color-fg-muted)]'}`}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div className="border border-black/[0.08] bg-[var(--color-surface-1)] p-3 space-y-2.5">
            <label className="block">
              <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Name</div>
              <input type="text" value={name} onChange={(e) => setName(e.target.value.replace(/[^a-zA-Z0-9_-]/g, ''))}
                className="mt-1 w-full bg-transparent border-b border-black/[0.1] py-0.5 font-mono text-[12px] outline-none focus:border-[var(--color-cat-gen)]" />
            </label>
            <div>
              <div className="flex items-baseline justify-between">
                <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Duration</span>
                <span className="font-mono text-[12px] tabular-nums">{duration.toFixed(1)}s</span>
              </div>
              <input type="range" min={0.1} max={5} step={0.1} value={duration} onChange={(e) => setDuration(Number(e.target.value))}
                className="mt-1 w-full accent-[var(--color-cat-gen)]" />
            </div>
            <div>
              <div className="flex items-baseline justify-between">
                <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Delay</span>
                <span className="font-mono text-[12px] tabular-nums">{delay.toFixed(1)}s</span>
              </div>
              <input type="range" min={0} max={3} step={0.1} value={delay} onChange={(e) => setDelay(Number(e.target.value))}
                className="mt-1 w-full accent-[var(--color-cat-gen)]" />
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)] mb-1">Easing</div>
              <select value={easing} onChange={(e) => setEasing(e.target.value)}
                className="w-full bg-transparent border border-black/[0.08] py-1.5 font-mono text-[11px] outline-none focus:border-[var(--color-cat-gen)]">
                {EASINGS.map((e) => <option key={e} value={e}>{e}</option>)}
              </select>
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)] mb-1">Iteration</div>
              <div className="grid grid-cols-3 gap-1">
                {['1', '2', 'infinite'].map((it) => (
                  <button key={it} type="button" onClick={() => setIteration(it)}
                    className={`border py-1.5 text-[11px] font-bold transition ${iteration === it ? 'border-[var(--color-cat-gen)] bg-[var(--color-cat-gen)] text-white' : 'border-black/[0.08]'}`}>
                    {it}
                  </button>
                ))}
              </div>
            </div>
            <label className="block">
              <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Keyframes</div>
              <textarea value={keyframes} onChange={(e) => setKeyframes(e.target.value)} rows={4}
                className="mt-1 w-full bg-[var(--color-canvas)] border border-black/[0.08] p-2 font-mono text-[10px] outline-none focus:border-[var(--color-cat-gen)]" />
            </label>
          </div>
        </aside>
      </div>
    </div>
  );
}
