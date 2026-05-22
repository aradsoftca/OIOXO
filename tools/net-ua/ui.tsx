'use client';
import * as React from 'react';
import { TextTool } from '@/components/tool/TextTool';
import { parseUserAgent } from '@/engines/net';

export default function Tool() {
  const myUa = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const [seed, setSeed] = React.useState(0);
  return (
    <div className="space-y-3">
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={() => setSeed((s) => s + 1)}
          className="border border-black/[0.08] bg-[var(--color-surface-1)] px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-[var(--color-fg)] transition hover:bg-[var(--color-surface-2)]"
        >
          Use my UA
        </button>
      </div>
      <TextTool
        key={seed}
        toolId="net-ua"
        colorVar="--color-cat-ip"
        inputPlaceholder="Paste a User-Agent string…"
        initialInput={seed > 0 ? myUa : ''}
        transform={(s) => {
          if (!s.trim()) return 'Paste a User-Agent string, or click "Use my UA".';
          const u = parseUserAgent(s);
          return [
            `Browser   ${u.browser} ${u.browserVersion}`.trim(),
            `Engine    ${u.engine}`,
            `OS        ${u.os} ${u.osVersion}`.trim(),
            `Device    ${u.device}`,
            `Bot       ${u.bot ? 'yes' : 'no'}`,
            '',
            '── Raw ──',
            u.raw,
          ].join('\n');
        }}
      />
    </div>
  );
}
