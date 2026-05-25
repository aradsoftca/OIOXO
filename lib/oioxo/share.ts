/**
 * oioxo Agentic IDE (AGENTIC_IDE.md §6) — peer-to-peer project sharing. Hand a
 * whole project (Temp or just-built) to another person with a short code: the
 * files flow BROWSER-TO-BROWSER over the same WebRTC channel as Xonvert Send
 * (lib/p2p/peer). Host-nothing — the relay only carries the handshake, never the
 * code, and nothing is stored.
 *
 * The wire protocol is a tiny message reducer kept PURE (Node-tested): a manifest,
 * one message per file, then a done marker. sendProject/receiveProject wire it to
 * the real peer; ShareReceiver is the pure assembler the receiver feeds.
 */
import type { CodeFile } from './codeloop';
import { connectPeer, makeRoomCode, type Peer, type PeerState } from '@/lib/p2p/peer';

export interface ProjectMeta {
  name?: string;
  template?: string;
  goal?: string;
  /** Command that runs/previews it, carried so the receiver can pick up running. */
  runCmd?: string;
  preview?: boolean;
}
export interface SharePayload {
  meta: ProjectMeta;
  files: CodeFile[];
}

type ShareMsg =
  | { kind: 'manifest'; meta: ProjectMeta; count: number }
  | { kind: 'file'; path: string; content: string }
  | { kind: 'done' }
  /** Live co-editing: after the initial transfer the channel stays open and each
   *  side broadcasts file edits; the other applies them (last-write-wins). */
  | { kind: 'edit'; path: string; content: string };

/** The ordered messages that transmit a project (pure — drives sendProject). */
export function projectMessages(payload: SharePayload): ShareMsg[] {
  return [
    { kind: 'manifest', meta: payload.meta, count: payload.files.length },
    ...payload.files.map((f): ShareMsg => ({ kind: 'file', path: f.path, content: f.content })),
    { kind: 'done' },
  ];
}

/** Pure receiver-side assembler: feed it incoming messages; it emits the payload
 *  once `done` arrives. Lets the receive logic be unit-tested without a network. */
export class ShareReceiver {
  private meta: ProjectMeta = {};
  private files: CodeFile[] = [];
  private count = 0;
  done = false;
  /** Feed one message; returns the assembled payload when complete, else null. */
  accept(msg: ShareMsg): SharePayload | null {
    if (!msg || this.done) return null;
    if (msg.kind === 'manifest') {
      this.meta = msg.meta ?? {};
      this.count = msg.count ?? 0;
    } else if (msg.kind === 'file' && typeof msg.path === 'string') {
      this.files.push({ path: msg.path, content: msg.content ?? '' });
    } else if (msg.kind === 'done') {
      this.done = true;
      return { meta: this.meta, files: this.files };
    }
    return null;
  }
  /** Files received so far / files expected (for a progress bar). */
  progress(): { received: number; total: number } {
    return { received: this.files.length, total: this.count };
  }
}

export interface SendHandle {
  /** The code to give the other person. */
  room: string;
  /** Broadcast a local file edit to the peer (live co-editing). */
  sendEdit(path: string, content: string): void;
  cancel(): void;
}

/** Offer a project for pickup. Returns the room code immediately; the files are
 *  pushed the moment a receiver connects. Pass `onRemoteEdit` to keep the channel
 *  open afterwards for live co-editing (use the returned `sendEdit`). */
export function sendProject(
  payload: SharePayload,
  h: {
    onState?: (s: PeerState) => void;
    onProgress?: (sent: number, total: number) => void;
    onDone?: () => void;
    onRemoteEdit?: (path: string, content: string) => void;
  } = {},
): SendHandle {
  const room = makeRoomCode();
  const msgs = projectMessages(payload);
  const total = payload.files.length;
  let peer: Peer | null = null;
  let flushed = false;

  const flush = () => {
    if (flushed || !peer) return;
    flushed = true;
    let sent = 0;
    for (const m of msgs) {
      peer.send(m);
      if (m.kind === 'file') h.onProgress?.(++sent, total);
    }
    h.onDone?.();
  };

  peer = connectPeer('s', room, {
    onState: (s) => { h.onState?.(s); if (s === 'connected') flush(); },
    onMessage: (m: ShareMsg) => { if (m?.kind === 'edit') h.onRemoteEdit?.(m.path, m.content); },
  });

  return {
    room,
    sendEdit: (path, content) => peer?.send({ kind: 'edit', path, content } satisfies ShareMsg),
    cancel: () => peer?.close(),
  };
}

export interface ReceiveHandle {
  /** Broadcast a local file edit back to the sender (live co-editing). */
  sendEdit(path: string, content: string): void;
  cancel(): void;
}

/** Pick up a project by code. Calls onComplete with the assembled payload. Pass
 *  `onRemoteEdit` to keep the channel open for live co-editing after transfer. */
export function receiveProject(
  room: string,
  h: {
    onState?: (s: PeerState) => void;
    onProgress?: (received: number, total: number) => void;
    onComplete?: (payload: SharePayload) => void;
    onRemoteEdit?: (path: string, content: string) => void;
  } = {},
): ReceiveHandle {
  const rx = new ShareReceiver();
  const live = !!h.onRemoteEdit;
  let peer: Peer | null = null;
  peer = connectPeer('r', room, {
    onState: h.onState,
    onMessage: (data: ShareMsg) => {
      if (data?.kind === 'edit') { h.onRemoteEdit?.(data.path, data.content); return; }
      const done = rx.accept(data);
      const p = rx.progress();
      h.onProgress?.(p.received, p.total);
      if (done) { h.onComplete?.(done); if (!live) peer?.close(); } // stay open for co-editing
    },
  });
  return {
    sendEdit: (path, content) => peer?.send({ kind: 'edit', path, content } satisfies ShareMsg),
    cancel: () => peer?.close(),
  };
}
