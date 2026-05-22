/**
 * User-pinned tile order — like a personal Windows Phone Start screen.
 */

const KEY = 'xonvert:pins';

export function getPins(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

export function setPins(ids: string[]) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(KEY, JSON.stringify(ids));
  window.dispatchEvent(new CustomEvent('xonvert:pins-update'));
}

export function togglePin(id: string) {
  const pins = getPins();
  const idx = pins.indexOf(id);
  if (idx >= 0) pins.splice(idx, 1);
  else pins.unshift(id);
  setPins(pins);
}
