'use client';
/**
 * Xonvert AI — file hand-off.
 *
 * Lets the AI "open the right tool with your file already loaded" for the long
 * tail of tools it can't run inline. The AI stages the File in this module
 * singleton, then navigates (client-side) to /tools/{id}; the tool's Drop
 * component picks the staged file up on mount via `useStagedInput`.
 *
 * Why a module singleton: Next App-Router client navigation keeps the JS
 * context alive, so the File reference survives the route change (it can't go
 * through a URL or sessionStorage). Cleared on read; expires after 90s so a
 * stale staged file never loads into an unrelated tool the user opens later.
 */

import * as React from 'react';

let staged: { file: File; ts: number } | null = null;
const TTL_MS = 90_000;

export function stageHandoff(file: File): void {
  staged = { file, ts: Date.now() };
}

export function takeStagedFile(): File | null {
  if (!staged) return null;
  if (Date.now() - staged.ts > TTL_MS) { staged = null; return null; }
  const f = staged.file;
  staged = null;
  return f;
}

/** On mount, feed any staged file into the tool's own loader. */
export function useStagedInput(onFile: (file: File) => void): void {
  React.useEffect(() => {
    const f = takeStagedFile();
    if (f) onFile(f);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
