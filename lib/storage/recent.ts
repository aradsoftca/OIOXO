/**
 * Recent-output thumbnails for live tiles.
 *
 * We persist a small data URL (or blob URL) per tool in localStorage.
 * Tiles read this to show "user's recent output" — the magic that makes
 * the home screen feel alive.
 */

const KEY = 'xonvert:recent';

export interface RecentEntry {
  toolId: string;
  /** data URL or short blob URL */
  thumb: string;
  /** ms epoch */
  at: number;
}

type RecentMap = Record<string, RecentEntry>;

function read(): RecentMap {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    // Defensive: a browser extension or older code could have written a
    // non-object shape (null, array, string). Without this guard the next
    // call to setRecent / getRecent crashes on `parsed[toolId]` and every
    // tile that reads recents stays broken until localStorage is cleared.
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return parsed as RecentMap;
  } catch {
    return {};
  }
}

function write(map: RecentMap) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(KEY, JSON.stringify(map));
    window.dispatchEvent(new CustomEvent('xonvert:recent-update'));
  } catch {
    // Quota exceeded — drop the oldest half and retry once.
    const entries = Object.values(map).sort((a, b) => b.at - a.at);
    const kept: RecentMap = {};
    entries.slice(0, Math.max(1, Math.floor(entries.length / 2))).forEach((e) => {
      kept[e.toolId] = e;
    });
    try {
      localStorage.setItem(KEY, JSON.stringify(kept));
      // Notify listeners — without this, tiles keep showing the pre-prune
      // state until the next successful write happens to fire the event.
      window.dispatchEvent(new CustomEvent('xonvert:recent-update'));
    } catch {
      // give up
    }
  }
}

export function getRecent(toolId: string): RecentEntry | undefined {
  return read()[toolId];
}

export function getAllRecent(): RecentMap {
  return read();
}

export function setRecent(toolId: string, thumb: string) {
  const map = read();
  map[toolId] = { toolId, thumb, at: Date.now() };
  write(map);
}

export function clearRecent(toolId?: string) {
  if (!toolId) {
    if (typeof window !== 'undefined') localStorage.removeItem(KEY);
    return;
  }
  const map = read();
  delete map[toolId];
  write(map);
}
