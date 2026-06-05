/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Mesh A/V topology — every peer connects directly to every other peer over a
 * deterministic per-pair room. The signaling relay is only used for roster
 * discovery; audio/video and data flow directly between every pair.
 *
 * For groups up to ~8 it's the simplest correct model. Each peer's upload is
 * O(N-1) — fine for normal home connections at 720p, less so beyond 8 peers.
 */

import { connectMedia, type MediaPeer, type MediaState } from './media';
import { makeRoomCode } from './peer';

export interface MeshPeerInfo {
  id: string;
  name: string;
  stream?: MediaStream;
  state: MediaState;
  speaking?: boolean;
}

export interface MeshHandlers {
  onRoster: (peers: MeshPeerInfo[]) => void;
  onMessage?: (fromId: string, fromName: string, text: string) => void;
  onPeerStream?: (peerId: string, stream: MediaStream) => void;
  onPeerLeft?: (peerId: string) => void;
  onSelfId?: (id: string) => void;
}

export interface Mesh {
  /** Broadcast a string (chat, reactions, raise-hand wire messages) to every peer. */
  send: (text: string) => void;
  /** Replace this peer's published video track on every connection (camera ↔ screen). */
  replaceVideoTrack: (track: MediaStreamTrack | null) => void;
  /** Replace this peer's published audio track on every connection (mic switch). */
  replaceAudioTrack: (track: MediaStreamTrack | null) => void;
  /** Stop and disconnect from everyone. */
  close: () => void;
  /** Currently published local stream (for re-publishing after a track swap). */
  localStream: MediaStream | null;
}

interface InternalPeer {
  id: string;
  name: string;
  peer: MediaPeer;
  state: MediaState;
  stream?: MediaStream;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function pairRoom(base: string, a: string, b: string): string {
  const [x, y] = [a, b].sort();
  return `${base}-pair-${x}-${y}`;
}

export function joinMesh(baseRoom: string, name: string, localStream: MediaStream | null, h: MeshHandlers): Mesh {
  const selfId = makeRoomCode();
  h.onSelfId?.(selfId);

  const peers = new Map<string, InternalPeer>();
  let stopped = false;
  let cursor = 0;
  let cachedStream = localStream;

  const emitRoster = () => {
    const list: MeshPeerInfo[] = Array.from(peers.values()).map((p) => ({
      id: p.id, name: p.name, stream: p.stream, state: p.state,
    }));
    h.onRoster(list);
  };

  const connectTo = (otherId: string, otherName: string) => {
    if (peers.has(otherId) || otherId === selfId) return;
    // Cap the mesh so a hostile sender (or a misconfigured group) can't
    // make us spin up 1000 RTCPeerConnections by spamming mesh-hello
    // messages with distinct peerIds — each connection holds DTLS state
    // and a media-pipeline socket, so unbounded growth crashes the tab.
    // 32 is far above the practical mesh cap (everyone's upload is N-1
    // streams, so it's only sane to ~8 anyway).
    if (peers.size >= 32) return;
    // Sanity-check peer-supplied strings so a hostile mesh-hello can't
    // freeze the receiver by pushing a megabyte name into roster state.
    if (typeof otherId !== 'string' || otherId.length > 64) return;
    if (typeof otherName !== 'string') return;
    otherName = otherName.slice(0, 64);
    const role: 's' | 'r' = selfId < otherId ? 's' : 'r';
    const room = pairRoom(baseRoom, selfId, otherId);
    const peer = connectMedia(role, room, {
      localStream: cachedStream,
      onState: (s) => {
        const p = peers.get(otherId);
        if (!p) return;
        p.state = s;
        if (s === 'closed' || s === 'failed') {
          peers.delete(otherId);
          h.onPeerLeft?.(otherId);
        }
        emitRoster();
      },
      onRemoteStream: (rs) => {
        const p = peers.get(otherId);
        if (!p) return;
        p.stream = rs;
        h.onPeerStream?.(otherId, rs);
        emitRoster();
      },
      onMessage: (text) => {
        h.onMessage?.(otherId, otherName, text);
      },
    });
    peers.set(otherId, { id: otherId, name: otherName, peer, state: 'connecting' });
    emitRoster();
  };

  const announce = async () => {
    while (!stopped) {
      try {
        await fetch(`/api/signal/${encodeURIComponent(baseRoom)}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ from: 'r', data: { kind: 'mesh-hello', peerId: selfId, name } }),
        });
      } catch { /* ignore */ }
      await sleep(peers.size === 0 ? 1500 : 5000);
    }
  };

  const listen = async () => {
    let backoff = 900;
    while (!stopped) {
      try {
        const r = await fetch(`/api/signal/${encodeURIComponent(baseRoom)}?from=s&after=${cursor}&_=${Date.now()}`, { cache: 'no-store' });
        if (!r.ok) throw new Error(`signal ${r.status}`);
        const j = (await r.json()) as { messages?: { seq: number; data: any }[]; cursor?: number };
        for (const m of j.messages ?? []) {
          const d = m.data;
          if (d?.kind === 'mesh-hello' && d.peerId && d.peerId !== selfId) {
            connectTo(d.peerId, d.name || 'Guest');
          }
        }
        if (j.cursor) cursor = j.cursor;
        backoff = 900;
      } catch {
        // Exponential backoff so a failing signal endpoint doesn't get
        // hammered at 900ms forever by every mesh participant.
        backoff = Math.min(backoff * 2, 15_000);
      }
      await sleep(backoff);
    }
  };

  void announce();
  void listen();

  return {
    send: (text) => {
      for (const p of peers.values()) p.peer.send(text);
    },
    replaceVideoTrack: (track) => {
      for (const p of peers.values()) p.peer.replaceVideoTrack(track);
    },
    replaceAudioTrack: (track) => {
      for (const p of peers.values()) p.peer.replaceAudioTrack(track);
    },
    close: () => {
      stopped = true;
      for (const p of peers.values()) p.peer.close();
      peers.clear();
    },
    get localStream() { return cachedStream; },
  };
}
