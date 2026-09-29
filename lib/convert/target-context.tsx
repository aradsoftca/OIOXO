'use client';
/**
 * The target format a /convert/{from}-to-{to} page is for. Without it every
 * pair page opened its tool on the tool's own default — /convert/png-to-jpg
 * downloaded WebP, /convert/step-to-obj produced STL. Tools read it as their
 * initial output choice; outside a pair page it is undefined.
 */
import * as React from 'react';

const Ctx = React.createContext<string | undefined>(undefined);

export function ConvertTargetProvider({ to, children }: { to: string; children: React.ReactNode }) {
  return <Ctx.Provider value={to.toLowerCase()}>{children}</Ctx.Provider>;
}

/** The page's target if it is one of `allowed` (after aliasing), else `fallback`. */
export function useConvertTarget<T extends string>(allowed: readonly T[], fallback: T, aliases: Record<string, T> = {}): T {
  const to = React.useContext(Ctx);
  if (!to) return fallback;
  const v = (aliases[to] ?? to) as T;
  return allowed.includes(v) ? v : fallback;
}

/** The page's raw target (e.g. 'pem'), for tools whose outputs depend on the dropped file. */
export function usePageTarget(): string | undefined {
  return React.useContext(Ctx);
}
