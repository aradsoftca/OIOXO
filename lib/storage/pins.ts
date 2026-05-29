/**
 * User-pinned tile order — like a personal Windows Phone Start screen.
 */

const KEY = 'xonvert:pins';

export function getPins(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    // Defensive: an external page or older code may have written a non-array
    // shape ({}, a string, null). Without this guard downstream .indexOf /
    // .unshift on a non-array throws and breaks every pin button on the page.
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === 'string');
  } catch {
    return [];
  }
}

export function setPins(ids: string[]) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(KEY, JSON.stringify(ids));
    window.dispatchEvent(new CustomEvent('xonvert:pins-update'));
  } catch {
    // Quota exceeded or storage disabled — swallow so togglePin doesn't
    // throw out of an onClick handler and leave the button in a stuck state.
  }
}

export function togglePin(id: string) {
  const pins = getPins();
  const idx = pins.indexOf(id);
  if (idx >= 0) pins.splice(idx, 1);
  else pins.unshift(id);
  setPins(pins);
}
