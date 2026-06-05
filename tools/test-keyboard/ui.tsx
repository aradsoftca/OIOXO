'use client';
import * as React from 'react';

// Physical layout by event.code so it works regardless of language layout.
const ROWS: string[][] = [
  ['Escape', 'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12'],
  ['Backquote', 'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0', 'Minus', 'Equal', 'Backspace'],
  ['Tab', 'KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyT', 'KeyY', 'KeyU', 'KeyI', 'KeyO', 'KeyP', 'BracketLeft', 'BracketRight', 'Backslash'],
  ['CapsLock', 'KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG', 'KeyH', 'KeyJ', 'KeyK', 'KeyL', 'Semicolon', 'Quote', 'Enter'],
  ['ShiftLeft', 'KeyZ', 'KeyX', 'KeyC', 'KeyV', 'KeyB', 'KeyN', 'KeyM', 'Comma', 'Period', 'Slash', 'ShiftRight'],
  ['ControlLeft', 'MetaLeft', 'AltLeft', 'Space', 'AltRight', 'MetaRight', 'ControlRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown', 'ArrowRight'],
];
const LABEL: Record<string, string> = {
  Escape: 'Esc', Backquote: '`', Minus: '-', Equal: '=', Backspace: '⌫', Tab: 'Tab',
  BracketLeft: '[', BracketRight: ']', Backslash: '\\', CapsLock: 'Caps', Semicolon: ';',
  Quote: '\'', Enter: '⏎', ShiftLeft: 'Shift', ShiftRight: 'Shift', Comma: ',', Period: '.',
  Slash: '/', ControlLeft: 'Ctrl', ControlRight: 'Ctrl', MetaLeft: 'Win', MetaRight: 'Win',
  AltLeft: 'Alt', AltRight: 'Alt', Space: 'Space', ArrowLeft: '←', ArrowUp: '↑', ArrowDown: '↓', ArrowRight: '→',
};
const key = (code: string) => LABEL[code] ?? code.replace(/^(Key|Digit)/, '');

export default function KeyboardTest() {
  const [down, setDown] = React.useState<Set<string>>(new Set());
  const [seen, setSeen] = React.useState<Set<string>>(new Set());
  const [last, setLast] = React.useState<{ code: string; key: string } | null>(null);

  React.useEffect(() => {
    const kd = (e: KeyboardEvent) => {
      e.preventDefault();
      setDown((s) => new Set(s).add(e.code));
      setSeen((s) => new Set(s).add(e.code));
      setLast({ code: e.code, key: e.key === ' ' ? 'Space' : e.key });
    };
    const ku = (e: KeyboardEvent) => setDown((s) => { const n = new Set(s); n.delete(e.code); return n; });
    window.addEventListener('keydown', kd); window.addEventListener('keyup', ku);
    return () => { window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); };
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-4 text-[12px]">
        <span>Pressed now: <strong className="tabular-nums">{down.size}</strong> (rollover)</span>
        {last && <span>Last: <code className="bg-black/[0.06] px-1.5 py-0.5">{last.key}</code> <span className="text-[var(--color-fg-muted)]">({last.code})</span></span>}
        <button type="button" onClick={() => setSeen(new Set())} className="ml-auto border border-black/[0.12] px-3 py-1.5 font-semibold hover:bg-[var(--color-surface-2)]">Reset highlights</button>
      </div>
      <div className="select-none space-y-1.5 overflow-x-auto border border-black/[0.08] bg-[var(--color-surface-1)] p-3">
        {ROWS.map((row, ri) => (
          <div key={ri} className="flex gap-1.5">
            {row.map((code) => {
              const isDown = down.has(code); const wasSeen = seen.has(code);
              const wide = code === 'Space' ? 'flex-[6]' : ['Backspace', 'Tab', 'CapsLock', 'Enter', 'ShiftLeft', 'ShiftRight'].includes(code) ? 'flex-[2]' : 'flex-1';
              return (
                <div key={code} className={`grid h-10 ${wide} place-items-center rounded text-[11px] font-semibold transition-colors ${isDown ? 'bg-[var(--color-cat-test)] text-white' : wasSeen ? 'bg-[var(--color-cat-test)]/20 text-[var(--color-fg)]' : 'bg-black/[0.05] text-[var(--color-fg-muted)]'}`}>
                  {key(code)}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <p className="text-[11px] text-[var(--color-fg-subtle)]">Press every key — keys you’ve pressed stay tinted, so any key that never lights up is dead. Hold several at once to test rollover/ghosting.</p>
    </div>
  );
}
