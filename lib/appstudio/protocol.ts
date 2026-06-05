export type StudioWire =
  | { t: 'chat'; text: string; name?: string; ts?: number; replyTo?: number; id?: number }
  | { t: 'rxn'; emoji: string; name?: string }
  | { t: 'hand'; up: boolean; name?: string }
  | { t: 'wb'; stroke: { color: string; width: number; pts: number[] } }
  | { t: 'wb-clear' }
  | { t: 'caption'; text: string; name?: string; final?: boolean }
  | { t: 'rec'; on: boolean }
  | { t: 'pin'; id: number; up: boolean }
  | { t: 'react'; id: number; emoji: string; name?: string }
  | { t: 'thread'; parentId: number; text: string; name?: string; ts?: number; id?: number }
  | { t: 'play'; pos: number; playing: boolean }
  | { t: 'q-add'; url: string; title: string }
  | { t: 'q-next' }
  | { t: 'poll'; id: number; q: string; opts: string[] }
  | { t: 'vote'; pollId: number; opt: number; name?: string };

export function encodeWire(m: StudioWire): string {
  return '' + JSON.stringify(m);
}

export function decodeWire(s: string): StudioWire | null {
  if (s.charCodeAt(0) !== 1) return null;
  try {
    return JSON.parse(s.slice(1)) as StudioWire;
  } catch {
    return null;
  }
}

export function isWire(s: string): boolean {
  return s.charCodeAt(0) === 1;
}
