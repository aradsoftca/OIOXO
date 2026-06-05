'use client';
import * as React from 'react';
import { Maximize2 } from 'lucide-react';

const SCREENS: { label: string; css: string }[] = [
  { label: 'White', css: '#ffffff' }, { label: 'Black', css: '#000000' },
  { label: 'Red', css: '#ff0000' }, { label: 'Green', css: '#00ff00' }, { label: 'Blue', css: '#0000ff' },
  { label: 'Cyan', css: '#00ffff' }, { label: 'Magenta', css: '#ff00ff' }, { label: 'Yellow', css: '#ffff00' },
  { label: 'Gray', css: '#808080' },
  { label: 'Gradient', css: 'linear-gradient(90deg,#000,#fff)' },
];

export default function MonitorTest() {
  const [active, setActive] = React.useState(false);
  const [i, setI] = React.useState(0);
  const ref = React.useRef<HTMLDivElement | null>(null);

  const enter = async () => {
    setActive(true);
    try { await ref.current?.requestFullscreen?.(); } catch { /* fullscreen optional */ }
  };
  const exit = () => { setActive(false); if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); };

  React.useEffect(() => {
    const onFs = () => { if (!document.fullscreenElement) setActive(false); };
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  const next = () => setI((n) => (n + 1) % SCREENS.length);
  const prev = () => setI((n) => (n - 1 + SCREENS.length) % SCREENS.length);

  return (
    <div className="space-y-4">
      <div
        ref={ref}
        onClick={() => active && next()}
        className={active ? 'fixed inset-0 z-[200] cursor-pointer' : 'grid h-56 cursor-pointer place-items-center border border-black/[0.08]'}
        style={{ background: SCREENS[i].css }}
      >
        {active && (
          <div className="pointer-events-none fixed left-1/2 top-4 -translate-x-1/2 rounded bg-black/50 px-3 py-1 text-[12px] text-white">
            {SCREENS[i].label} — click for next · Esc to exit
          </div>
        )}
        {!active && <span className="bg-black/40 px-2 py-1 text-[12px] text-white">{SCREENS[i].label} preview</span>}
      </div>

      {active && (
        <button type="button" onClick={exit} className="fixed right-4 top-4 z-[201] bg-black/60 px-3 py-1.5 text-[12px] font-semibold text-white">Exit</button>
      )}

      {!active && (
        <>
          <div className="flex flex-wrap gap-1.5">
            {SCREENS.map((s, idx) => (
              <button key={s.label} type="button" onClick={() => setI(idx)}
                className={`border px-3 py-1.5 text-[12px] font-semibold ${i === idx ? 'border-[var(--color-cat-test)] bg-[var(--color-cat-test)]/10' : 'border-black/[0.12]'}`}>{s.label}</button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={prev} className="border border-black/[0.12] px-3 py-2 text-[12px] font-semibold">Prev</button>
            <button type="button" onClick={next} className="border border-black/[0.12] px-3 py-2 text-[12px] font-semibold">Next</button>
            <button type="button" onClick={enter} className="ml-auto flex items-center gap-2 bg-[var(--color-cat-test)] px-4 py-2 text-[12px] font-bold uppercase tracking-wider text-white"><Maximize2 className="h-3.5 w-3.5" /> Full screen test</button>
          </div>
          <p className="text-[11px] text-[var(--color-fg-subtle)]">Go full screen and click through each color. A pixel that stays a wrong color is dead/stuck; uneven edges on black show backlight bleed.</p>
        </>
      )}
    </div>
  );
}
