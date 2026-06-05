/**
 * oioxo Code — SHARE THE VERIFIED-BRICK CORPUS over P2P (the weak-device magic,
 * lever 4). A brick proven on one device is useful to every device; pooling them
 * means the network's WEAKEST phone inherits the strongest device's verified
 * blocks — so it can build things its own tiny model could never author. The
 * weights/bricks flow browser-to-browser over the same WebRTC channel as Xonvert
 * Send (lib/p2p/peer) — host-nothing, near-zero egress.
 *
 * SECURITY KEYSTONE: a brick from a peer is UNTRUSTED CODE. We do NOT believe a
 * peer's `verified` flag — the receiving device RE-PROVES every incoming brick
 * with its OWN oracle before it can ever be suggested (brick-store.importShared
 * → bricks.revalidateForImport). This is the same "the device proves it, it never
 * trusts a claim" rule the whole engine runs on, extended to distribution.
 *
 * The wire protocol is a tiny pure reducer (Node-tested), mirroring share.ts;
 * sendBricks/receiveBricks wire it to the real peer (injectable for loopback tests).
 */
import type { Brick } from './bricks';
import { connectPeer, makeRoomCode, type Peer, type PeerState, type PeerHandlers } from '@/lib/p2p/peer';

export type ConnectFn = (role: 's' | 'r', room: string, h: PeerHandlers) => Peer;

type BrickMsg =
  | { kind: 'manifest'; count: number }
  | { kind: 'brick'; brick: Brick }
  | { kind: 'done' };

/** Ordered messages that transmit a corpus (pure — drives sendBricks). */
export function brickMessages(bricks: Brick[]): BrickMsg[] {
  return [
    { kind: 'manifest', count: bricks.length },
    ...bricks.map((b): BrickMsg => ({ kind: 'brick', brick: b })),
    { kind: 'done' },
  ];
}

/** Pure receiver-side assembler: feed incoming messages; emits the raw (still
 *  UNTRUSTED) brick list once `done` arrives. The caller MUST re-validate before
 *  use — see brick-store.importSharedBricks. */
export class BrickShareReceiver {
  private bricks: Brick[] = [];
  private count = 0;
  done = false;
  accept(msg: BrickMsg): Brick[] | null {
    if (!msg || this.done) return null;
    if (msg.kind === 'manifest') {
      this.count = msg.count ?? 0;
    } else if (msg.kind === 'brick' && msg.brick && typeof msg.brick.code === 'string') {
      this.bricks.push(msg.brick);
    } else if (msg.kind === 'done') {
      this.done = true;
      return this.bricks;
    }
    return null;
  }
  progress(): { received: number; total: number } {
    return { received: this.bricks.length, total: this.count };
  }
}

export interface SendHandle { room: string; cancel(): void; }

/** Offer the corpus for pickup; returns the room code immediately and pushes the
 *  bricks the moment a receiver connects. */
export function sendBricks(
  bricks: Brick[],
  h: {
    onState?: (s: PeerState) => void;
    onProgress?: (sent: number, total: number) => void;
    onDone?: () => void;
    connect?: ConnectFn;
  } = {},
): SendHandle {
  const room = makeRoomCode();
  const msgs = brickMessages(bricks);
  let peer: Peer | null = null;
  let flushed = false;
  const flush = () => {
    if (flushed || !peer) return;
    flushed = true;
    let sent = 0;
    for (const m of msgs) {
      peer.send(m);
      if (m.kind === 'brick') h.onProgress?.(++sent, bricks.length);
    }
    h.onDone?.();
  };
  peer = (h.connect ?? connectPeer)('s', room, {
    onState: (s) => { h.onState?.(s); if (s === 'connected') flush(); },
    onMessage: () => { /* one-way push; receiver doesn't reply */ },
  });
  return { room, cancel: () => peer?.close() };
}

export interface ReceiveHandle { cancel(): void; }

/** Pick up a shared corpus by code. Calls onComplete with the raw, still-UNTRUSTED
 *  bricks — the caller re-validates (brick-store.importSharedBricks) before any
 *  are usable. */
export function receiveBricks(
  room: string,
  h: {
    onState?: (s: PeerState) => void;
    onProgress?: (received: number, total: number) => void;
    onComplete?: (bricks: Brick[]) => void;
    connect?: ConnectFn;
  } = {},
): ReceiveHandle {
  const rx = new BrickShareReceiver();
  let peer: Peer | null = null;
  peer = (h.connect ?? connectPeer)('r', room, {
    onState: h.onState,
    onMessage: (data: BrickMsg) => {
      const done = rx.accept(data);
      const p = rx.progress();
      h.onProgress?.(p.received, p.total);
      if (done) { h.onComplete?.(done); peer?.close(); }
    },
  });
  return { cancel: () => peer?.close() };
}
