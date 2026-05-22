'use client';

import * as React from 'react';
import { Tile } from './Tile';
import { TileIcon } from './TileIcon';

/**
 * Hero — "Every file. Every tool. One tap." with a chat-style input
 * that hands off to the Cmd+K palette. Uses neutral surface tile on cream.
 */
export function HeroDropTile() {
  const [query, setQuery] = React.useState('');

  const submit = () => {
    if (query.trim()) {
      window.dispatchEvent(new CustomEvent('xonvert:open-palette', { detail: { query } }));
    }
  };

  return (
    <Tile
      size="W"
      neutral
      acceptsDrop
      className="!cursor-default"
      aria-label="Drop a file or describe what you want"
    >
      <div className="flex h-full flex-col justify-between">
        <div className="flex items-start gap-3">
          <div className="bg-black/[0.04] p-2.5">
            <TileIcon name="sparkles" size={22} strokeWidth={1.75} className="text-[var(--color-fg)]" />
          </div>
          <div className="flex-1">
            <div className="text-[9px] font-bold uppercase tracking-[0.2em] text-[var(--color-fg-subtle)]">
              Drop · Describe · Done
            </div>
            <div className="mt-1.5 text-[28px] font-semibold leading-[1.05] tracking-tight text-[var(--color-fg)] text-balance">
              Every file. Every tool. One tap.
            </div>
          </div>
        </div>

        <div
          className="flex items-center gap-2 border border-black/[0.08] bg-white/70 px-4 py-3 transition focus-within:border-[var(--color-cat-image)]"
          onClick={(e) => e.stopPropagation()}
        >
          <TileIcon name="command" size={16} className="text-[var(--color-fg-subtle)]" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
            placeholder="Convert to mp3 — or drop a file anywhere on this page"
            className="flex-1 bg-transparent text-[14px] text-[var(--color-fg)] placeholder:text-[var(--color-fg-subtle)] focus:outline-none"
          />
          <kbd className="border border-black/10 bg-black/[0.04] px-1.5 py-0.5 font-mono text-[10px] text-[var(--color-fg-subtle)]">
            ⌘K
          </kbd>
        </div>
      </div>
    </Tile>
  );
}
