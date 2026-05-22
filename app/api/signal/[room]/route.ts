/**
 * P2P signaling relay for "Xonvert Send".
 *
 * This ONLY relays the tiny WebRTC handshake messages (SDP offer/answer + ICE
 * candidates) that let two browsers find each other. The actual file NEVER
 * passes through here — it streams directly browser-to-browser over an
 * encrypted WebRTC data channel. Messages live in memory for a few minutes and
 * are dropped; nothing is persisted.
 *
 * Transport is plain HTTP polling (no WebSocket server needed): each peer POSTs
 * its messages and GETs the other peer's messages since a cursor.
 */
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Msg { seq: number; from: 's' | 'r'; data: unknown }
interface Room { log: Msg[]; seq: number; ts: number }

// Module-level state persists across requests in the single `next start` process.
const rooms = new Map<string, Room>();

const ROOM_TTL_MS = 10 * 60 * 1000; // forget idle rooms after 10 min
const MAX_LOG = 256;                 // cap handshake messages per room
const MAX_BODY = 64 * 1024;          // 64 KB — SDP/ICE are tiny
const MAX_ROOMS = 5000;

function sweep() {
  const now = Date.now();
  for (const [code, room] of rooms) {
    if (now - room.ts > ROOM_TTL_MS) rooms.delete(code);
  }
}

function noStore(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate', 'Pragma': 'no-cache' },
  });
}

function getRoom(code: string): Room {
  let room = rooms.get(code);
  if (!room) {
    if (rooms.size > MAX_ROOMS) sweep();
    room = { log: [], seq: 0, ts: Date.now() };
    rooms.set(code, room);
  }
  room.ts = Date.now();
  return room;
}

/** GET /api/signal/:room?from=s|r&after=N → messages from the OTHER peer. */
export async function GET(req: Request, ctx: { params: Promise<{ room: string }> }) {
  sweep();
  const { room: code } = await ctx.params;
  const url = new URL(req.url);
  const from = url.searchParams.get('from') === 'r' ? 'r' : 's';
  const after = Number(url.searchParams.get('after') || 0) || 0;
  const room = rooms.get(code);
  if (!room) return noStore({ messages: [], cursor: after });
  room.ts = Date.now();
  const messages = room.log.filter((m) => m.from !== from && m.seq > after);
  const cursor = messages.length ? messages[messages.length - 1].seq : after;
  return noStore({ messages, cursor });
}

/** POST /api/signal/:room  { from, data } → enqueue one handshake message. */
export async function POST(req: Request, ctx: { params: Promise<{ room: string }> }) {
  const { room: code } = await ctx.params;
  if (!/^[A-Za-z0-9-]{4,32}$/.test(code)) return noStore({ error: 'bad room' }, 400);
  let body: { from?: string; data?: unknown };
  try {
    const text = await req.text();
    if (text.length > MAX_BODY) return noStore({ error: 'too large' }, 413);
    body = JSON.parse(text);
  } catch {
    return noStore({ error: 'bad body' }, 400);
  }
  const from = body.from === 'r' ? 'r' : 's';
  const room = getRoom(code);
  room.seq += 1;
  room.log.push({ seq: room.seq, from, data: body.data });
  if (room.log.length > MAX_LOG) room.log.splice(0, room.log.length - MAX_LOG);
  return noStore({ ok: true, seq: room.seq });
}
