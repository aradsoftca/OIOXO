/**
 * Global file-SIZE gate — the second free-tier limit (alongside daily count).
 *
 * File-input components (VideoDrop, PdfDrop, AudioDrop, …) live all over the app
 * and don't each own a modal. So they call `checkFreeSize(category, bytes)`: if
 * the file is within the free cap (or the session is Pro) it resolves true and
 * the tool proceeds; if it's over the cap for a free user it asks the globally
 * mounted UsageGateProvider to show the polite upgrade gate and resolves false,
 * so the component aborts the load.
 *
 * Mirrors gate-bridge.ts (a module singleton coordinating UI mounted elsewhere).
 */

import type { Category } from '@/lib/registry/types';
import { freeMaxBytesFor } from './config';

export interface SizeGateInfo {
  category: Category;
  bytes: number;
  cap: number;
}

type Handler = (info: SizeGateInfo) => void;

let handler: Handler | null = null;

/** UsageGateProvider registers the function that shows the size-gate modal. */
export function registerSizeGate(fn: Handler | null): void {
  handler = fn;
}

/**
 * Resolve true if a free user may process a file of `bytes` in `category`
 * (within cap), or the session is Pro. Resolve false (and pop the upgrade gate)
 * when a free user's file exceeds the cap. FAILS OPEN: any uncertainty allows
 * the file — the gate is a monetization lever, never a reason to lose work.
 */
export async function checkFreeSize(category: Category, bytes: number): Promise<boolean> {
  const cap = freeMaxBytesFor(category);
  if (!Number.isFinite(cap) || bytes <= cap) return true; // uncapped or within free cap
  // Over the free cap — but Pro has no size limit.
  try {
    const { isWatermarkOn } = await import('@/lib/watermark/config');
    const free = await isWatermarkOn(); // watermark ON ⇒ free tier
    if (!free) return true; // Pro → allow any size
  } catch {
    return true; // can't tell → fail open
  }
  // Free user, file too big → show the gate and block this load.
  if (handler) handler({ category, bytes, cap });
  return false;
}
