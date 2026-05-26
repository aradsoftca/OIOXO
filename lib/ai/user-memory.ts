/**
 * user-memory — the AI remembers YOU across turns and sessions (maturity #3).
 *
 * A small on-device store of lasting user facts/preferences ("call me Alex",
 * "I'm vegetarian", "always reply in Spanish") that the engine recalls and applies
 * later — the single thing that most makes an assistant feel modern. Stays on the
 * device (localStorage in the browser, in-memory in Node/SSR); nothing uploaded.
 *
 * Two feeders: this deterministic `capturePreference` floor (clear explicit
 * statements), AND the trained conductor's `remember` field (the general case).
 * Pure detection + a tiny isomorphic KV store; Node-testable.
 */
export type MemoryKind = 'name' | 'language' | 'preference' | 'fact';
export interface Memory { kind: MemoryKind; value: string; at: number }

const KEY = 'oioxo.user.memory';
const mem: Memory[] = [];

function persist(): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, JSON.stringify(mem));
  } catch { /* private mode / SSR → in-memory only */ }
}
function hydrate(): void {
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(KEY);
      if (raw && !mem.length) for (const m of JSON.parse(raw)) mem.push(m);
    }
  } catch { /* ignore */ }
}
hydrate();

/** Store a memory, de-duping by kind+value (name/language are single-valued). */
export function remember(kind: MemoryKind, value: string): void {
  const v = value.trim();
  if (!v) return;
  if (kind === 'name' || kind === 'language') {
    const i = mem.findIndex((m) => m.kind === kind);
    if (i >= 0) mem[i] = { kind, value: v, at: Date.now() };
    else mem.push({ kind, value: v, at: Date.now() });
  } else if (!mem.some((m) => m.kind === kind && m.value.toLowerCase() === v.toLowerCase())) {
    mem.push({ kind, value: v, at: Date.now() });
  }
  persist();
}
export function recall(): Memory[] { return [...mem]; }
export function recallName(): string | null { return mem.find((m) => m.kind === 'name')?.value ?? null; }
export function recallLanguage(): string | null { return mem.find((m) => m.kind === 'language')?.value ?? null; }
export function forgetAll(): void { mem.length = 0; persist(); }

/** A compact line of remembered context to weave into an answer prompt, or ''. */
export function memoryContext(): string {
  if (!mem.length) return '';
  const name = recallName();
  const prefs = mem.filter((m) => m.kind === 'preference' || m.kind === 'fact').map((m) => m.value);
  const bits: string[] = [];
  if (name) bits.push(`the user's name is ${name}`);
  if (prefs.length) bits.push(`the user: ${prefs.join('; ')}`);
  return bits.join(' · ');
}

// ── Deterministic capture of CLEAR, lasting preferences (low false-positive). ──
// Transient feelings ("I'm tired/confused") are NOT preferences — excluded by
// requiring explicit "remember/call me/always/I prefer/I'm allergic" framing.
const CAP_NAME = /\b(?:my name is|call me|i'?m called|i go by)\s+([A-Z][a-zA-Z'-]{1,20})\b/;
const CAP_LANG = /\b(?:always |from now on )?(?:reply|answer|respond|talk to me|write)\s+(?:to me\s+)?in\s+([A-Z][a-z]{2,15})\b(?:\s+(?:from now on|please))?/i;
const CAP_REMEMBER = /\b(?:remember(?:\s+that)?|keep in mind(?:\s+that)?|note(?:\s+that)?|for future reference,?|just so you know,?)\s+(.{3,120})/i;
const CAP_PREF = /\b(i\s+(?:prefer|really like|don'?t like|hate|always|never|usually)\b.{2,90}|i(?:'?m| am)\s+(?:allergic to|vegetarian|vegan|diabetic|gluten[- ]free|lactose intolerant)\b.{0,60})/i;
const cap1 = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function capturePreference(text: string): Memory | null {
  const t = text.trim();
  let m = t.match(CAP_NAME);
  if (m) return { kind: 'name', value: m[1], at: Date.now() };
  m = t.match(CAP_LANG);
  if (m) return { kind: 'language', value: cap1(m[1]), at: Date.now() };
  m = t.match(CAP_REMEMBER);
  if (m) return { kind: 'fact', value: m[1].replace(/[.?!]+$/, '').trim(), at: Date.now() };
  m = t.match(CAP_PREF);
  if (m) return { kind: 'preference', value: m[1].replace(/[.?!]+$/, '').trim(), at: Date.now() };
  return null;
}
