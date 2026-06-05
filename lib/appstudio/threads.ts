export type MsgKind = 'text' | 'media' | 'file' | 'voice' | 'system' | 'poll';

export interface RichMsg {
  id: number;
  ts: number;
  mine: boolean;
  name: string;
  kind: MsgKind;
  text?: string;
  url?: string;
  mime?: string;
  fileName?: string;
  size?: number;
  durationMs?: number;
  pinned?: boolean;
  parentId?: number;
  reactions?: Record<string, string[]>;
  pollId?: number;
  /** Delivery state for messages I sent: optimistic echo → wire-confirmed →
   *  acked by a peer. Undefined on received messages. */
  status?: 'sending' | 'sent' | 'delivered';
  /** Stable client id used to correlate a delivery ack across the wire. */
  cid?: string;
}

export function indexById(msgs: RichMsg[]): Map<number, RichMsg> {
  const m = new Map<number, RichMsg>();
  for (const x of msgs) m.set(x.id, x);
  return m;
}

export function rootsAndThreads(msgs: RichMsg[]): { roots: RichMsg[]; children: Map<number, RichMsg[]> } {
  const roots: RichMsg[] = [];
  const children = new Map<number, RichMsg[]>();
  for (const m of msgs) {
    if (m.parentId == null) {
      roots.push(m);
    } else {
      const arr = children.get(m.parentId) ?? [];
      arr.push(m);
      children.set(m.parentId, arr);
    }
  }
  return { roots, children };
}

export function addReaction(msg: RichMsg, emoji: string, name: string): RichMsg {
  const r = { ...(msg.reactions ?? {}) };
  const arr = r[emoji] ?? [];
  if (arr.includes(name)) {
    const next = arr.filter((n) => n !== name);
    if (next.length) r[emoji] = next;
    else delete r[emoji];
  } else {
    r[emoji] = [...arr, name];
  }
  return { ...msg, reactions: r };
}

export const SLASH_COMMANDS = [
  { cmd: '/summarize', desc: 'Summarize the conversation' },
  { cmd: '/translate', desc: 'Translate the last message' },
  { cmd: '/ask', desc: 'Ask the AI a question' },
  { cmd: '/poll', desc: 'Create a poll: /poll Q? | a | b | c' },
  { cmd: '/me', desc: 'Speak in third person' },
  { cmd: '/clear', desc: 'Clear local view (others keep history)' },
  { cmd: '/pin', desc: 'Pin the last message' },
];

export function parseSlash(input: string): { cmd: string; args: string } | null {
  const m = input.match(/^(\/[a-z]+)(?:\s+([\s\S]*))?$/i);
  if (!m) return null;
  return { cmd: m[1].toLowerCase(), args: (m[2] ?? '').trim() };
}
