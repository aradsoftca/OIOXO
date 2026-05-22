'use client';

import dynamic from 'next/dynamic';

/**
 * Homepage AI hero. The AI component is loaded as its OWN chunk (ssr: false,
 * after hydration) so it doesn't bloat the homepage's first-load JS or block
 * SEO crawlers. A lightweight box placeholder shows instantly; the live chat
 * box swaps in a moment later, and the model itself only loads on first focus.
 */
const AiApp = dynamic(() => import('@/app/ai/AiApp'), {
  ssr: false,
  loading: () => (
    <div className="terminal flex h-[calc(100dvh-210px)] min-h-[380px] max-h-[680px] flex-col justify-end border border-[#1c2b22] sm:h-[calc(100dvh-280px)]">
      <div className="grid flex-1 place-items-center text-[13px] text-[var(--term-dim)]">
        <span className="terminal-glow text-[var(--term-fg)]">&gt; loading assistant…<span className="terminal-caret" /></span>
      </div>
      <div className="border-t border-[#16241c] p-3">
        <div className="flex items-center gap-2">
          <div className="h-10 w-10 shrink-0 bg-white/[0.04]" />
          <div className="h-10 flex-1 bg-white/[0.04]" />
          <div className="h-10 w-10 shrink-0 bg-[var(--term-fg)]/30" />
        </div>
      </div>
    </div>
  ),
});

export function HomeAiHero() {
  return <AiApp embedded />;
}
