'use client';

import * as React from 'react';

export const REACTION_EMOJIS = ['👍','❤️','😂','🎉','👏','🔥','🙌','😮','💯','🥳','🤔','👀'];

interface Floater {
  id: number;
  emoji: string;
  x: number;
  ts: number;
}

export function useReactionFloaters() {
  const [floaters, setFloaters] = React.useState<Floater[]>([]);
  const idRef = React.useRef(0);
  const push = React.useCallback((emoji: string) => {
    const id = ++idRef.current;
    setFloaters((f) => [...f, { id, emoji, x: 0.2 + Math.random() * 0.6, ts: Date.now() }]);
    window.setTimeout(() => setFloaters((f) => f.filter((x) => x.id !== id)), 3000);
  }, []);
  return { floaters, push };
}

export function ReactionLayer({ floaters }: { floaters: Floater[] }) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {floaters.map((f) => (
        <span
          key={f.id}
          className="absolute text-[28px] reaction-float"
          style={{ left: `${f.x * 100}%`, bottom: '4%' }}
        >
          {f.emoji}
        </span>
      ))}
      <style jsx>{`
        @keyframes reactFloat {
          0% { transform: translate(-50%, 0) scale(0.85); opacity: 0; }
          15% { opacity: 1; transform: translate(-50%, -10px) scale(1.05); }
          90% { opacity: 1; }
          100% { transform: translate(-50%, -80vh) scale(0.9); opacity: 0; }
        }
        .reaction-float {
          animation: reactFloat 3s ease-out forwards;
          will-change: transform, opacity;
        }
      `}</style>
    </div>
  );
}

export function ReactionPicker({ onPick, compact }: { onPick: (e: string) => void; compact?: boolean }) {
  return (
    <div className={compact ? 'flex flex-wrap gap-0.5' : 'flex flex-wrap gap-1'}>
      {REACTION_EMOJIS.map((e) => (
        <button
          key={e}
          type="button"
          onClick={() => onPick(e)}
          className={`${compact ? 'p-0.5 text-[18px]' : 'p-1 text-[22px]'} transition hover:scale-125`}
        >
          {e}
        </button>
      ))}
    </div>
  );
}
