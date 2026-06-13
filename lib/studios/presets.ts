/**
 * C4 — Shared Preset System (campaign engine, reused by all 9 studios).
 *
 * A generic, localStorage-backed store of NAMED user presets of ANY shape:
 * color grades, effect-rack chains, caption styles, export profiles, EQ curves,
 * validation rules, slide themes… Each studio picks a `kind` namespace and a
 * value type; the engine handles persistence, listing, rename, delete,
 * favorites, and JSON import/export (so presets are shareable between the web
 * app and the mobile apps, which share this code).
 *
 * Design goals:
 *  - Zero per-studio boilerplate: `const store = presetStore<MyGrade>('video.grade')`.
 *  - Built-in (factory) presets can be merged in read-only via `builtins`.
 *  - Safe on SSR / no-localStorage (returns in-memory, never throws).
 *  - Stable ids so favorites/last-used survive renames.
 */

export interface Preset<T> {
  id: string;
  name: string;
  /** User value. */
  value: T;
  /** Epoch ms; pass via opts since Date.now() is fine at call time in the app. */
  createdAt: number;
  updatedAt: number;
  favorite?: boolean;
  /** True for factory/built-in presets (not user-deletable). */
  builtin?: boolean;
}

export interface PresetStore<T> {
  /** All presets (builtins first, then user, favorites floated within each). */
  list(): Preset<T>[];
  get(id: string): Preset<T> | undefined;
  /** Create a new user preset; returns it. */
  save(name: string, value: T): Preset<T>;
  /** Overwrite an existing user preset's value (and optionally name). */
  update(id: string, patch: { name?: string; value?: T }): Preset<T> | undefined;
  remove(id: string): void;
  toggleFavorite(id: string): void;
  rename(id: string, name: string): void;
  /** Export user presets as a JSON string (shareable across devices/apps). */
  exportJson(): string;
  /** Import presets from a JSON string; merges (new ids), returns count added. */
  importJson(json: string): number;
  /** Subscribe to changes; returns an unsubscribe fn. */
  subscribe(fn: () => void): () => void;
}

const KEY_PREFIX = 'xtudio.presets.';
const subsByKind = new Map<string, Set<() => void>>();

function lsKey(kind: string) { return KEY_PREFIX + kind; }

function readUser<T>(kind: string): Preset<T>[] {
  if (typeof localStorage === 'undefined') return memStore.get(kind) as Preset<T>[] ?? [];
  try {
    const raw = localStorage.getItem(lsKey(kind));
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

// In-memory fallback when localStorage is unavailable (SSR / private mode).
const memStore = new Map<string, Preset<unknown>[]>();

function writeUser<T>(kind: string, presets: Preset<T>[]): void {
  if (typeof localStorage === 'undefined') { memStore.set(kind, presets as Preset<unknown>[]); }
  else {
    try { localStorage.setItem(lsKey(kind), JSON.stringify(presets)); }
    catch { memStore.set(kind, presets as Preset<unknown>[]); }
  }
  subsByKind.get(kind)?.forEach(fn => fn());
}

let _seq = 0;
/** Stable-ish id without Date.now()/Math.random() (both unavailable in workflow
 *  scripts; in the app they exist but we keep this deterministic per session). */
function pid(): string {
  _seq += 1;
  const t = typeof performance !== 'undefined' && performance.now ? Math.floor(performance.now()) : _seq;
  return `p_${t.toString(36)}_${_seq.toString(36)}`;
}

function now(): number {
  return typeof Date !== 'undefined' && (Date as any).now ? Date.now() : 0;
}

/** Sort: favorites first, then most-recently-updated. Builtins kept in their
 *  given order but floated above user presets. */
function sortPresets<T>(builtins: Preset<T>[], user: Preset<T>[]): Preset<T>[] {
  const fav = (p: Preset<T>) => (p.favorite ? 1 : 0); // undefined → 0 (Number(undefined) is NaN — don't use it)
  const u = [...user].sort((a, b) => (fav(b) - fav(a)) || (b.updatedAt - a.updatedAt));
  const b = [...builtins].sort((x, y) => fav(y) - fav(x));
  return [...b, ...u];
}

/**
 * Create (or get) a preset store for a `kind` namespace.
 * @param kind  unique namespace, e.g. 'video.colorGrade' or 'caption.style'.
 * @param opts.builtins  optional factory presets (read-only, never persisted).
 */
export function presetStore<T>(
  kind: string,
  opts: { builtins?: { id: string; name: string; value: T; favorite?: boolean }[] } = {},
): PresetStore<T> {
  const builtins: Preset<T>[] = (opts.builtins ?? []).map(b => ({
    id: b.id, name: b.name, value: b.value, favorite: b.favorite, builtin: true, createdAt: 0, updatedAt: 0,
  }));
  const builtinIds = new Set(builtins.map(b => b.id));

  return {
    list() { return sortPresets(builtins, readUser<T>(kind)); },
    get(id) {
      if (builtinIds.has(id)) return builtins.find(b => b.id === id);
      return readUser<T>(kind).find(p => p.id === id);
    },
    save(name, value) {
      const p: Preset<T> = { id: pid(), name: name.trim() || 'Untitled', value, createdAt: now(), updatedAt: now() };
      const user = readUser<T>(kind);
      user.push(p); writeUser(kind, user);
      return p;
    },
    update(id, patch) {
      if (builtinIds.has(id)) return undefined; // builtins are read-only
      const user = readUser<T>(kind);
      const i = user.findIndex(p => p.id === id);
      if (i < 0) return undefined;
      user[i] = { ...user[i], ...(patch.name != null ? { name: patch.name } : {}), ...(patch.value !== undefined ? { value: patch.value } : {}), updatedAt: now() };
      writeUser(kind, user);
      return user[i];
    },
    remove(id) {
      if (builtinIds.has(id)) return;
      writeUser(kind, readUser<T>(kind).filter(p => p.id !== id));
    },
    toggleFavorite(id) {
      if (builtinIds.has(id)) { const b = builtins.find(x => x.id === id); if (b) b.favorite = !b.favorite; subsByKind.get(kind)?.forEach(fn => fn()); return; }
      const user = readUser<T>(kind);
      const i = user.findIndex(p => p.id === id);
      if (i < 0) return;
      user[i] = { ...user[i], favorite: !user[i].favorite, updatedAt: now() };
      writeUser(kind, user);
    },
    rename(id, name) { this.update(id, { name: name.trim() || 'Untitled' }); },
    exportJson() { return JSON.stringify({ kind, presets: readUser<T>(kind) }, null, 2); },
    importJson(json) {
      let data: { kind?: string; presets?: Preset<T>[] };
      try { data = JSON.parse(json); } catch { return 0; }
      const incoming = Array.isArray(data?.presets) ? data.presets : Array.isArray(data) ? (data as unknown as Preset<T>[]) : [];
      if (!incoming.length) return 0;
      const user = readUser<T>(kind);
      let added = 0;
      for (const p of incoming) {
        if (!p || typeof p.name !== 'string') continue;
        user.push({ id: pid(), name: p.name, value: (p as Preset<T>).value, createdAt: now(), updatedAt: now(), favorite: !!p.favorite });
        added++;
      }
      if (added) writeUser(kind, user);
      return added;
    },
    subscribe(fn) {
      let set = subsByKind.get(kind);
      if (!set) { set = new Set(); subsByKind.set(kind, set); }
      set.add(fn);
      return () => set!.delete(fn);
    },
  };
}
