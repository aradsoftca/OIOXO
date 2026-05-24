/**
 * oioxo Code P5 — execution tiers (OIOXO_CODE.md §4). The loop is the same
 * everywhere; only the ORACLE (how code is run) and optionally the CODER change
 * with the hardware. This picks the strongest oracle the current environment can
 * offer, so the workspace "just works" from a locked-down browser up to a native
 * desktop app — same UI, same loop, stronger proof where the machine allows it.
 *
 *   native      → Tauri desktop: real filesystem + real process exec (truth)
 *   webcontainer→ cross-origin-isolated Chromium: Node in a WASM sandbox
 *   typecheck   → any browser: fast in-browser tsc (no run, but exact types)
 */
import { runSupported } from './coderun';
import { isDesktop } from './native';

export type Tier = 'native' | 'webcontainer' | 'typecheck';

/** The strongest oracle available here. native > webcontainer > typecheck. */
export function detectTier(): Tier {
  if (isDesktop()) return 'native';
  if (runSupported()) return 'webcontainer';
  return 'typecheck';
}

/** Human label for the tier (UI). */
export function tierLabel(t: Tier): string {
  return t === 'native' ? 'Native (real exec)' : t === 'webcontainer' ? 'Sandbox (Node)' : 'Types (fast)';
}
