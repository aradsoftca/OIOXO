/**
 * Studios are hidden + disabled on xonvert until they are finished. One list
 * (disabled-ids.json) drives the registry filter, the apps/studios rows and the
 * next.config redirects, so nothing links to a studio and a direct URL bounces
 * to /tools. oioxo keeps them.
 */
import { IS_OIOXO } from '@/lib/brand';
import disabled from './disabled-ids.json';

export const STUDIOS_DISABLED = !IS_OIOXO;

export const DISABLED_STUDIO_IDS: ReadonlySet<string> = new Set(
  STUDIOS_DISABLED ? disabled.ids : [],
);

export function isStudioDisabled(id: string): boolean {
  return DISABLED_STUDIO_IDS.has(id);
}
