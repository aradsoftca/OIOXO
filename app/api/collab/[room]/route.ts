/**
 * N-party WebRTC signaling relay for the Studios collaboration + watch-party /
 * group features.
 *
 * Like /api/signal (which is strictly 2-party: sender↔receiver for "Send"),
 * this ONLY relays the tiny WebRTC handshake (SDP offer/answer + ICE + join/
 * leave/awareness) so browsers in a room can find each other. Documents, media,
 * and chat NEVER pass through here — those go peer-to-peer over the encrypted
 * data channels once the handshake completes. Messages live in memory for a few
 * minutes and are dropped; nothing is persisted. This honors the no-server-
 * compute rule: the relay forwards opaque bytes and computes nothing.
 *
 * Difference from /api/signal: a room has MANY peers, each identified by a
 * client-chosen peerId. A peer GETs every message from OTHER peers since a
 * cursor (it filters by the `to` field itself, as the collab layer already
 * does). Transport is HTTP polling — no WebSocket server required.
 */
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Msg { seq: number; from: string; data: unknown }
interface Room { log: Msg[]; seq: number; ts: number; peers: Set<string> }

// Module-level state persists across requests in the single `next start` process.
const rooms = new Map<string, Room>();

const ROOM_TTL_MS = 15 * 60 * 1000; // forget idle rooms after 15 min
const MAX_LOG = 1024;                // cap handshake messages per room (N peers → more chatter than 2-party)
const MAX_BODY = 64 * 1024;          // 64 KB — SDP/ICE are tiny
const MAX_ROOMS = 5000;
const MAX_PEERS = 64;                // refuse runaway rooms

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

// Room and peer share the same charset so a room code can never be silently
// rejected for containing a character a peer id allows (the app generates
// lowercase-alphanumeric room codes, but a caller passing e.g. `team_2026`
// should connect, not fail closed with a generic "bad room"). Underscore is
// harmless here — these are opaque keys into an in-memory Map, never paths.
function validRoom(code: string): boolean { return /^[A-Za-z0-9_-]{4,40}$/.test(code); }
function validPeer(id: string): boolean { return /^[A-Za-z0-9_-]{1,40}$/.test(id); }

function getRoom(code: string): Room | null {
  let room = rooms.get(code);
  if (!room) {
    if (rooms.size >= MAX_ROOMS) {
      sweep();
      if (rooms.size >= MAX_ROOMS) return null;
    }
    room = { log: [], seq: 0, ts: Date.now(), peers: new Set() };
    rooms.set(code, room);
  }
  room.ts = Date.now();
  return room;
}

/** GET /api/collab/:room?peer=ID&after=N → messages from OTHER peers since N. */
export async function GET(req: Request, ctx: { params: Promise<{ room: string }> }) {
  sweep();
  const { room: code } = await ctx.params;
  if (!validRoom(code)) return noStore({ messages: [], cursor: 0 }, 400);
  const url = new URL(req.url);
  const peer = url.searchParams.get('peer') || '';
  if (!validPeer(peer)) return noStore({ messages: [], cursor: 0 }, 400);
  const after = Number(url.searchParams.get('after') || 0) || 0;
  const room = rooms.get(code);
  if (!room) return noStore({ messages: [], cursor: after });
  room.ts = Date.now();
  room.peers.add(peer);
  // Every message from a DIFFERENT peer since the cursor. The collab layer
  // filters by the per-message `to` field (broadcast vs targeted) itself.
  const messages = room.log.filter((m) => m.from !== peer && m.seq > after);
  const cursor = messages.length ? messages[messages.length - 1].seq : after;
  return noStore({ messages, cursor });
}

/** POST /api/collab/:room  { peer, data } → enqueue one handshake message. */
export async function POST(req: Request, ctx: { params: Promise<{ room: string }> }) {
  const { room: code } = await ctx.params;
  if (!validRoom(code)) return noStore({ error: 'bad room' }, 400);
  let body: { peer?: string; data?: unknown };
  try {
    const text = await req.text();
    if (text.length > MAX_BODY) return noStore({ error: 'too large' }, 413);
    body = JSON.parse(text);
  } catch {
    return noStore({ error: 'bad body' }, 400);
  }
  const peer = typeof body.peer === 'string' ? body.peer : '';
  if (!validPeer(peer)) return noStore({ error: 'bad peer' }, 400);
  const room = getRoom(code);
  if (!room) return noStore({ error: 'server busy, try again' }, 503);
  if (!room.peers.has(peer) && room.peers.size >= MAX_PEERS) {
    return noStore({ error: 'room full' }, 503);
  }
  room.peers.add(peer);
  room.seq += 1;
  room.log.push({ seq: room.seq, from: peer, data: body.data });
  if (room.log.length > MAX_LOG) room.log.splice(0, room.log.length - MAX_LOG);
  return noStore({ ok: true, seq: room.seq });
}
