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
    return raw ? (JSON.parse(raw) as RecentMap) : {};
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
